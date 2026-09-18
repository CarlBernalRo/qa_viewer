import { z } from 'zod';
import type { AgentModel, AgentModelRequest, AgentModelUsage } from '../../domain/ports.js';
import { jsonSchemaOf, stripCodeFence } from './jsonSchema.js';

/** Errores pasajeros que vale la pena reintentar. */
const RETRYABLE = new Set([408, 429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 3;
const TIMEOUT_MS = 600_000;
/** Da espacio al razonamiento del modelo y al JSON de respuesta. */
const MAX_OUTPUT_TOKENS = 32_768;

/** El texto puede venir como string o como partes (algunos proveedores). */
const contentSchema = z
  .union([z.string(), z.array(z.object({ type: z.string().optional(), text: z.string().nullish() }))])
  .nullish();

/** Lo que interesa de la respuesta (formato "chat completions" de OpenAI, que estos proveedores replican). */
const completionSchema = z.object({
  choices: z
    .array(
      z.object({
        message: z.object({ content: contentSchema }).nullish(),
        finish_reason: z.string().nullish(),
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
  if (!error) return null;
  if (typeof error === 'string') return { message: error };
  if (typeof error !== 'object') return { message: String(error) };
  const { message } = error as { message?: unknown };
  return { message: typeof message === 'string' ? message : 'error sin detalle' };
}

/** Fallas de conexión: se reintentan. */
const isNetworkError = (error: unknown) => error instanceof Error && error.name === 'TypeError';

const isTimeout = (error: unknown) =>
  error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');

function textOf(content: z.infer<typeof contentSchema>): string {
  if (!content) return '';
  if (typeof content === 'string') return content;
  return content.map((part) => part.text ?? '').join('');
}

/**
 * Los agentes contra cualquier proveedor que hable el formato "chat completions" de OpenAI:
 * OpenAI, Groq, Mistral, DeepSeek y Ollama (con su capa de compatibilidad). No todos soportan
 * el modo estricto de OpenAI (`json_schema` con `strict: true`); por eso `structuredOutput` es
 * configurable por proveedor, y siempre se valida la respuesta contra el schema real igual.
 */
export class OpenAICompatibleAgentModel implements AgentModel {
  constructor(
    readonly provider: string,
    readonly model: string,
    private readonly endpoint: string,
    /** Variable de entorno de la clave, solo para el mensaje de error (nunca se expone el valor). */
    private readonly envKeyName: string,
    private readonly apiKey: string | undefined,
    private readonly structuredOutput: 'json_schema' | 'json_object' = 'json_object',
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
    const responseFormat =
      this.structuredOutput === 'json_schema'
        ? { type: 'json_schema', json_schema: { name: `informe_${agentId}`, strict: true, schema: jsonSchemaOf(schema) } }
        : { type: 'json_object' };
    const body = {
      model: this.model,
      messages: [
        { role: 'system', content: `${system}\n\n${brief}` },
        { role: 'user', content: userContent },
      ],
      response_format: responseFormat,
      max_tokens: MAX_OUTPUT_TOKENS,
    };
    const completion = await this.withRetries(() => this.post(body));

    const [choice] = completion.choices;
    if (choice?.finish_reason === 'length') throw new Error('La respuesta del agente quedó cortada por su largo.');
    const content = textOf(choice?.message?.content);
    if (!content.trim()) throw new Error('El modelo no devolvió texto (solo razonamiento). Reintenta o prueba otro modelo.');

    const usage = completion.usage;
    const cached = usage?.prompt_tokens_details?.cached_tokens ?? 0;
    return {
      output: schema.parse(JSON.parse(stripCodeFence(content))),
      usage: {
        inputTokens: Math.max(0, (usage?.prompt_tokens ?? 0) - cached),
        outputTokens: usage?.completion_tokens ?? 0,
        cacheReadTokens: cached,
        cacheWriteTokens: 0,
      },
    };
  }

  /** Errores de la API → mensajes que el QA entiende (y que no exponen la clave). */
  private describe(failure: ApiFailure): Error {
    if (failure.status === 401 || failure.status === 403) return new Error(`La clave de ${this.envKeyName} no es válida.`);
    if (failure.status === 404) {
      return new Error(`${this.provider} no encontró el modelo "${this.model}". Revisa RASTRO_AGENT_MODEL.`);
    }
    if (failure.status === 429) return new Error(`Se alcanzó el límite de uso de ${this.provider}. Espera un momento y vuelve a intentar.`);
    if (failure.status === 502 || failure.status === 503) {
      return new Error(`${this.provider} está saturado o no disponible (${failure.message}). Reintenta más tarde.`);
    }
    return new Error(`${this.provider} respondió ${failure.status}: ${failure.message}`);
  }

  private async post(body: unknown): Promise<Completion> {
    const response = await this.fetcher(this.endpoint, {
      method: 'POST',
      headers: {
        ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const text = await response.text();
    let payload: unknown = null;
    try {
      payload = JSON.parse(text);
    } catch {
      // Se informa abajo según el caso.
    }
    const apiError = errorOf(payload);
    if (!response.ok || apiError) {
      throw new ApiFailure(response.status, apiError?.message ?? `HTTP ${response.status}`);
    }
    if (payload === null) throw new ApiFailure(502, 'la conexión se cerró sin una respuesta completa');
    const parsed = completionSchema.safeParse(payload);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const where = issue?.path.length ? `${issue.path.join('.')}: ` : '';
      throw new Error(`${this.provider} devolvió una respuesta con un formato inesperado (${where}${issue?.message ?? 'sin detalle'}).`);
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
          if (error instanceof ApiFailure) throw this.describe(error);
          if (isTimeout(error)) {
            throw new Error(`${this.provider} no terminó de responder en ${TIMEOUT_MS / 60_000} minutos.`, { cause: error });
          }
          throw isNetworkError(error) ? new Error(`No se pudo conectar con ${this.provider}.`) : error;
        }
        await new Promise((resolve) => setTimeout(resolve, this.retryDelayMs * 2 ** (attempt - 1)));
      }
    }
  }
}
