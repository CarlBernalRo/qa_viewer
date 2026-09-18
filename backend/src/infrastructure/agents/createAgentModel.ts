import { AGENT_PROVIDER_META, type RealAgentProviderId } from '@rastro/shared';
import { ollamaBaseUrl, providerApiKey } from '../config/env.js';
import type { AgentModel } from '../../domain/ports.js';
import { AnthropicAgentModel } from './AnthropicAgentModel.js';
import { GeminiAgentModel } from './GeminiAgentModel.js';
import { OpenAICompatibleAgentModel } from './OpenAICompatibleAgentModel.js';
import { OpenRouterAgentModel } from './OpenRouterAgentModel.js';

type OpenAICompatibleProvider = 'openai' | 'groq' | 'mistral' | 'deepseek';

const OPENAI_COMPATIBLE_ENDPOINT: Record<OpenAICompatibleProvider, string> = {
  openai: 'https://api.openai.com/v1/chat/completions',
  groq: 'https://api.groq.com/openai/v1/chat/completions',
  mistral: 'https://api.mistral.ai/v1/chat/completions',
  deepseek: 'https://api.deepseek.com/chat/completions',
};

/**
 * Solo OpenAI documenta bien el modo estricto (`json_schema` + `strict: true`); el resto de los
 * proveedores compatibles usan el modo genérico `json_object` (siempre se valida igual contra
 * el schema real al recibir la respuesta).
 */
const OPENAI_COMPATIBLE_STRUCTURED: Record<OpenAICompatibleProvider, 'json_schema' | 'json_object'> = {
  openai: 'json_schema',
  groq: 'json_object',
  mistral: 'json_object',
  deepseek: 'json_object',
};

/** El adaptador del proveedor elegido; la clave se lee solo aquí. null si falta (Ollama no la necesita). */
export function createAgentModel(provider: RealAgentProviderId, model: string): AgentModel | null {
  const key = providerApiKey(provider);
  const meta = AGENT_PROVIDER_META[provider];
  switch (provider) {
    case 'gemini':
      return key ? new GeminiAgentModel(model, key) : null;
    case 'openrouter':
      return key ? new OpenRouterAgentModel(model, key) : null;
    case 'anthropic':
      return key ? new AnthropicAgentModel(model, key) : null;
    case 'ollama':
      return new OpenAICompatibleAgentModel('Ollama', model, `${ollamaBaseUrl()}/v1/chat/completions`, meta.envKey, key, 'json_object');
    case 'openai':
    case 'groq':
    case 'mistral':
    case 'deepseek':
      return key
        ? new OpenAICompatibleAgentModel(
            meta.label,
            model,
            OPENAI_COMPATIBLE_ENDPOINT[provider],
            meta.envKey,
            key,
            OPENAI_COMPATIBLE_STRUCTURED[provider],
          )
        : null;
  }
}
