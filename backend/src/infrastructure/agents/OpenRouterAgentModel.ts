import { z } from 'zod';
import type { AgentModel, AgentModelRequest, AgentModelUsage } from '../../domain/ports.js';
import { jsonSchemaOf, stripCodeFence } from './jsonSchema.js';

const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
/** Errores pasajeros que vale la pena reintentar. */
const RETRYABLE = new Set([408, 429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 3;
/**
 * Los modelos que razonan (y los gratuitos, con cola) pueden tardar varios minutos. OpenRouter
 * responde 200 enseguida y mantiene la conexión abierta hasta tener la respuesta completa.
 */
const TIMEOUT_MS = 600_000;
/** Da espacio al razonamiento del modelo y al JSON de respuesta. */
const MAX_OUTPUT_TOKENS = 32_768;

/** El texto puede venir como string o como partes (algunos proveedores). */
const contentSchema = z
  .union([z.string(), z.array(z.object({ type: z.string().optional(), text: z.string().nullish() }))])
  .nullish();

/** Lo que interesa de la respuesta (formato compatible con OpenAI). */
const completionSchema = z.object({
  choices: z
    .array(
      z.object({
        message: z.object({ content: contentSchema }).nullish(),
        finish_reason: z.string().nullish(),
        // Si el proveedor falla después de haber respondido 200, el error viene dentro de la opción.
        error: z.object({ code: z.number().nullish(), message: z.string().nullish() }).nullish(),
      }),
    )
    .min(1, 'no trajo ninguna respuesta del modelo'),
  usage: z
    .object({
      prompt_tokens: z.number(),
      completion_tokens: z.number(),
      prompt_tokens_details: z.object({ cached_tokens: z.number().nullish() }).nullish(),
    })
    .nullish(),
});
type Completion = z.infer<typeof completionSchema>;

/** Un error de la API con su código HTTP (OpenRouter también manda errores con status 200). */
class ApiFailure extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function errorOf(payload: unknown): { status?: number; message: string } | null {
  if (!payload || typeof payload !== 'object' || !('error' in payload)) return null;
  const error = (payload as { error: unknown }).error;
  if (!error || typeof error !== 'object') return { message: String(error) };
  const { code, message } = error as { code?: unknown; message?: unknown };
  return { ...(typeof code === 'number' ? { status: code } : {}), message: typeof message === 'string' ? message : 'error sin detalle' };
}

/** Errores de la API → mensajes que el QA entiende (y que no exponen la clave). */
function describe(failure: ApiFailure): Error {
  if (failure.status === 401) return new Error('La clave de OPENROUTER_API_KEY no es válida.');
  if (failure.status === 402) return new Error('La cuenta de OpenRouter no tiene saldo suficiente para este modelo.');
  if (failure.status === 403) return new Error(`OpenRouter bloqueó el pedido: ${failure.message}`);
  if (failure.status === 404) {
    // También pasa con modelos gratuitos si la política de datos de la cuenta no los permite.
    return new Error(
      `OpenRouter no encontró un modelo disponible (${failure.message}). Revisa RASTRO_AGENT_MODEL y, si es un modelo :free, la política de privacidad de tu cuenta en openrouter.ai.`,
    );
  }
  if (failure.status === 429) return new Error('Se alcanzó el límite de uso de OpenRouter. Espera un momento y vuelve a intentar.');
  if (failure.status === 502 || failure.status === 503) {
    return new Error(
      `El proveedor del modelo está saturado o no disponible (${failure.message}). Reintenta más tarde o prueba otro modelo en RASTRO_AGENT_MODEL.`,
    );
  }
  return new Error(`OpenRouter respondió ${failure.status}: ${failure.message}`);
}

/** Fallas de conexión: se reintentan. */
const isNetworkError = (error: unknown) => error instanceof Error && error.name === 'TypeError';

/** Tiempo agotado: no se reintenta, porque repetir un pedido tan largo solo multiplica la espera. */
const isTimeout = (error: unknown) =>
  error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');

const TIMEOUT_MESSAGE = `El modelo no terminó de responder en ${TIMEOUT_MS / 60_000} minutos. Los modelos gratuitos suelen estar saturados: reintenta más tarde o prueba otro modelo en RASTRO_AGENT_MODEL.`;

function textOf(content: z.infer<typeof contentSchema>): string {
  if (!content) return '';
  if (typeof content === 'string') return content;
  return content.map((part) => part.text ?? '').join('');
}

/**
 * Los agentes a través de OpenRouter, que da acceso a muchos modelos (Gemini incluido)
 * con una sola clave. La API es compatible con OpenAI, así que basta con fetch.
 */
export class OpenRouterAgentModel implements AgentModel {
  readonly provider = 'OpenRouter';

  constructor(
    readonly model: string,
    private readonly apiKey: string,
    private readonly fetcher: typeof fetch = fetch,
    private readonly retryDelayMs = 1000,
  ) {}

  async run<T>({ agentId, system, brief, task, schema, images }: AgentModelRequest<T>): Promise<{ output: T; usage: AgentModelUsage }> {
    const userContent =
      images && images.length > 0
        ? [
            { type: 'text', text: task },
            ...images.map((image) => ({ type: 'image_url', image_url: { url: `data:${image.mimeType};base64,${image.data}` } })),
          ]
        : task;
    const body = {
      model: this.model,
      messages: [
        // Reglas + resumen primero y siempre iguales: el proveedor puede reutilizar ese prefijo (caché).
        { role: 'system', content: `${system}\n\n${brief}` },
        { role: 'user', content: userContent },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: { name: `informe_${agentId}`, strict: true, schema: jsonSchemaOf(schema) },
      },
      // Solo proveedores que respeten el formato JSON pedido.
      provider: { require_parameters: true },
      max_tokens: MAX_OUTPUT_TOKENS,
    };
    const completion = await this.withRetries(() => this.post(body));

    const [choice] = completion.choices;
    if (choice?.error) {
      throw describe(new ApiFailure(choice.error.code ?? 502, choice.error.message ?? 'el proveedor falló al generar la respuesta'));
    }
    if (choice?.finish_reason === 'length') throw new Error('La respuesta del agente quedó cortada por su largo.');
    const content = textOf(choice?.message?.content);
    if (!content.trim()) throw new Error('El modelo no devolvió texto (solo razonamiento). Reintenta o prueba otro modelo.');

    const usage = completion.usage;
    const cached = usage?.prompt_tokens_details?.cached_tokens ?? 0;
    return {
      output: schema.parse(JSON.parse(stripCodeFence(content))),
      usage: {
        // prompt_tokens incluye lo que vino de la caché: se separa para no contarlo dos veces.
        inputTokens: Math.max(0, (usage?.prompt_tokens ?? 0) - cached),
        outputTokens: usage?.completion_tokens ?? 0,
        cacheReadTokens: cached,
        cacheWriteTokens: 0,
      },
    };
  }

  private async post(body: unknown): Promise<Completion> {
    const response = await this.fetcher(ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'X-Title': 'Rastro',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    // Leer el cuerpo también puede agotar el tiempo: ese error se propaga tal cual, no se confunde con un formato raro.
    const text = await response.text();
    let payload: unknown = null;
    try {
      payload = JSON.parse(text);
    } catch {
      // Se informa abajo según el caso.
    }
    const apiError = errorOf(payload);
    if (!response.ok || apiError) {
      throw new ApiFailure(apiError?.status ?? response.status, apiError?.message ?? `HTTP ${response.status}`);
    }
    // Cuerpo vacío o cortado: la conexión se cerró antes de tiempo. Es pasajero, se reintenta.
    if (payload === null) throw new ApiFailure(502, 'la conexión se cerró sin una respuesta completa');
    const parsed = completionSchema.safeParse(payload);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const where = issue?.path.length ? `${issue.path.join('.')}: ` : '';
      throw new Error(`OpenRouter devolvió una respuesta con un formato inesperado (${where}${issue?.message ?? 'sin detalle'}).`);
    }
    return parsed.data;
  }

  private async withRetries<R>(call: () => Promise<R>): Promise<R> {
    for (let attempt = 1; ; attempt += 1) {
      try {
        return await call();
      } catch (error) {
        const retryable = error instanceof ApiFailure ? RETRYABLE.has(error.status) : isNetworkError(error);
        if (!retryable || attempt >= MAX_ATTEMPTS) {
          if (error instanceof ApiFailure) throw describe(error);
          if (isTimeout(error)) throw new Error(TIMEOUT_MESSAGE, { cause: error });
          throw isNetworkError(error) ? new Error('No se pudo conectar con OpenRouter.') : error;
        }
        await new Promise((resolve) => setTimeout(resolve, this.retryDelayMs * 2 ** (attempt - 1)));
      }
    }
  }
}
