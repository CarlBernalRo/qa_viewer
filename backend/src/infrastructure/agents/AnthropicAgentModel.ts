import { z } from 'zod';
import type { AgentModel, AgentModelRequest, AgentModelUsage } from '../../domain/ports.js';
import { jsonSchemaOf } from './jsonSchema.js';

const ENDPOINT = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const RETRYABLE = new Set([408, 429, 500, 502, 503, 529]);
const MAX_ATTEMPTS = 3;
const TIMEOUT_MS = 600_000;
const MAX_OUTPUT_TOKENS = 8_192;
const TOOL_NAME = 'informar';

const usageSchema = z.object({
  input_tokens: z.number(),
  output_tokens: z.number(),
  cache_read_input_tokens: z.number().nullish(),
  cache_creation_input_tokens: z.number().nullish(),
});

/** Con `tool_choice` forzado a una sola herramienta, la respuesta trae el JSON ya parseado en `input`. */
const messageSchema = z.object({
  content: z.array(
    z.union([
      z.object({ type: z.literal('tool_use'), name: z.string(), input: z.unknown() }),
      z.object({ type: z.literal('text'), text: z.string() }),
      z.object({ type: z.string() }).loose(),
    ]),
  ),
  stop_reason: z.string().nullish(),
  usage: usageSchema,
});

class ApiFailure extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const isNetworkError = (error: unknown) => error instanceof Error && error.name === 'TypeError';
const isTimeout = (error: unknown) => error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');

/**
 * Los agentes contra Anthropic (Claude), con la API de Messages. La salida estructurada se pide
 * forzando una única "tool" cuyo `input_schema` es el schema real: Claude devuelve el JSON ya
 * validado contra esa forma en `input`, sin tener que parsear texto ni pedir un formato aparte.
 */
export class AnthropicAgentModel implements AgentModel {
  readonly provider = 'Anthropic';

  constructor(
    readonly model: string,
    private readonly apiKey: string,
    private readonly fetcher: typeof fetch = fetch,
    private readonly retryDelayMs = 1000,
  ) {}

  async run<T>({ system, brief, task, schema, images }: AgentModelRequest<T>): Promise<{ output: T; usage: AgentModelUsage }> {
    const content = [
      { type: 'text', text: task },
      ...(images ?? []).map((image) => ({
        type: 'image',
        source: { type: 'base64', media_type: image.mimeType, data: image.data },
      })),
    ];
    const body = {
      model: this.model,
      max_tokens: MAX_OUTPUT_TOKENS,
      system: `${system}\n\n${brief}`,
      messages: [{ role: 'user', content }],
      tools: [{ name: TOOL_NAME, description: 'Devuelve el informe con la forma pedida.', input_schema: jsonSchemaOf(schema) }],
      tool_choice: { type: 'tool', name: TOOL_NAME },
    };
    const message = await this.withRetries(() => this.post(body));

    if (message.stop_reason === 'max_tokens') throw new Error('La respuesta del agente quedó cortada por su largo.');
    const toolUse = message.content.find((block): block is { type: 'tool_use'; name: string; input: unknown } => block.type === 'tool_use');
    if (!toolUse) throw new Error('El modelo no devolvió el informe con la forma pedida. Reintenta o prueba otro modelo.');

    const usage = message.usage;
    return {
      output: schema.parse(toolUse.input),
      usage: {
        inputTokens: usage.input_tokens,
        outputTokens: usage.output_tokens,
        cacheReadTokens: usage.cache_read_input_tokens ?? 0,
        cacheWriteTokens: usage.cache_creation_input_tokens ?? 0,
      },
    };
  }

  private describe(failure: ApiFailure): Error {
    if (failure.status === 401) return new Error('La clave de ANTHROPIC_API_KEY no es válida.');
    if (failure.status === 403) return new Error(`Anthropic bloqueó el pedido: ${failure.message}`);
    if (failure.status === 404) return new Error(`Anthropic no encontró el modelo "${this.model}". Revisa RASTRO_AGENT_MODEL.`);
    if (failure.status === 429) return new Error('Se alcanzó el límite de uso de Anthropic. Espera un momento y vuelve a intentar.');
    if (failure.status === 529 || failure.status === 502 || failure.status === 503) {
      return new Error(`Anthropic está saturado (${failure.message}). Reintenta más tarde.`);
    }
    return new Error(`Anthropic respondió ${failure.status}: ${failure.message}`);
  }

  private async post(body: unknown): Promise<z.infer<typeof messageSchema>> {
    const response = await this.fetcher(ENDPOINT, {
      method: 'POST',
      headers: {
        'x-api-key': this.apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
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
    if (!response.ok) {
      const message =
        payload && typeof payload === 'object' && 'error' in payload
          ? ((payload as { error: { message?: string } }).error?.message ?? `HTTP ${response.status}`)
          : `HTTP ${response.status}`;
      throw new ApiFailure(response.status, message);
    }
    if (payload === null) throw new ApiFailure(502, 'la conexión se cerró sin una respuesta completa');
    const parsed = messageSchema.safeParse(payload);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const where = issue?.path.length ? `${issue.path.join('.')}: ` : '';
      throw new Error(`Anthropic devolvió una respuesta con un formato inesperado (${where}${issue?.message ?? 'sin detalle'}).`);
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
          if (isTimeout(error)) throw new Error('Anthropic no terminó de responder en 10 minutos.', { cause: error });
          throw isNetworkError(error) ? new Error('No se pudo conectar con Anthropic.') : error;
        }
        await new Promise((resolve) => setTimeout(resolve, this.retryDelayMs * 2 ** (attempt - 1)));
      }
    }
  }
}
