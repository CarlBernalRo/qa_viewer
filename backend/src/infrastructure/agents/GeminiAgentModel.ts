import { ApiError, FinishReason, GoogleGenAI } from '@google/genai';
import type { AgentModel, AgentModelRequest, AgentModelUsage } from '../../domain/ports.js';
import { jsonSchemaOf, stripCodeFence } from './jsonSchema.js';

/** Errores pasajeros que vale la pena reintentar (límite de uso, servidor ocupado). */
const RETRYABLE = new Set([429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 3;
/** Da espacio al razonamiento del modelo (cuenta como salida) y al JSON de respuesta. */
const MAX_OUTPUT_TOKENS = 32_768;

/** Errores de la API → mensajes que el QA entiende (y que no exponen la clave). */
function describe(error: unknown): Error {
  if (error instanceof ApiError) {
    if (error.status === 400 && /api key/i.test(error.message)) return new Error('La clave de GEMINI_API_KEY no es válida.');
    if (error.status === 401 || error.status === 403) {
      return new Error('La clave de Gemini no tiene permiso para usar el modelo configurado.');
    }
    if (error.status === 404) {
      return new Error('El modelo configurado no existe o esta clave no tiene acceso a él (revisa RASTRO_AGENT_MODEL).');
    }
    if (error.status === 429) {
      return new Error('Se alcanzó el límite de uso de Gemini. Espera un momento y vuelve a intentar.');
    }
    return new Error(`Gemini respondió ${error.status}: ${error.message}`);
  }
  return error instanceof Error ? error : new Error(String(error));
}

/**
 * Los agentes, con Google Gemini a través del SDK oficial (@google/genai).
 * La clave llega desde el arranque; no pasa por la configuración de Rastro ni por el frontend.
 */
export class GeminiAgentModel implements AgentModel {
  readonly provider = 'Google Gemini';
  private readonly client: GoogleGenAI;

  constructor(
    readonly model: string,
    apiKey: string,
  ) {
    this.client = new GoogleGenAI({ apiKey });
  }

  async run<T>({ system, brief, task, schema }: AgentModelRequest<T>): Promise<{ output: T; usage: AgentModelUsage }> {
    const response = await this.withRetries(() =>
      this.client.models.generateContent({
        model: this.model,
        contents: [{ role: 'user', parts: [{ text: task }] }],
        config: {
          // Reglas + resumen de la sesión van primero y son idénticos para los tres agentes:
          // así Gemini puede reutilizar ese prefijo (caché implícita) en el segundo y el tercero.
          systemInstruction: `${system}\n\n${brief}`,
          responseMimeType: 'application/json',
          responseJsonSchema: jsonSchemaOf(schema),
          maxOutputTokens: MAX_OUTPUT_TOKENS,
        },
      }),
    );

    const text = response.text;
    if (!text) {
      const finish = response.candidates?.[0]?.finishReason;
      if (finish === FinishReason.MAX_TOKENS) throw new Error('La respuesta del agente quedó cortada por su largo.');
      const reason = response.promptFeedback?.blockReason ?? finish ?? 'sin respuesta';
      throw new Error(`Gemini no devolvió una respuesta (${reason}).`);
    }

    const usage = response.usageMetadata;
    const cached = usage?.cachedContentTokenCount ?? 0;
    return {
      output: schema.parse(JSON.parse(stripCodeFence(text))),
      usage: {
        // promptTokenCount incluye lo que vino de la caché: se separa para no contarlo dos veces.
        inputTokens: Math.max(0, (usage?.promptTokenCount ?? 0) - cached),
        // El razonamiento del modelo se cobra como salida.
        outputTokens: (usage?.candidatesTokenCount ?? 0) + (usage?.thoughtsTokenCount ?? 0),
        cacheReadTokens: cached,
        cacheWriteTokens: 0,
      },
    };
  }

  private async withRetries<R>(call: () => Promise<R>): Promise<R> {
    for (let attempt = 1; ; attempt += 1) {
      try {
        return await call();
      } catch (error) {
        if (!(error instanceof ApiError) || !RETRYABLE.has(error.status) || attempt >= MAX_ATTEMPTS) throw describe(error);
        await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** (attempt - 1)));
      }
    }
  }
}
