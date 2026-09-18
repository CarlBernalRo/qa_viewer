import { z } from 'zod';

/**
 * Proveedores de modelo que Rastro sabe usar para los agentes. "auto" no es un proveedor real:
 * elige OpenRouter si hay `OPENROUTER_API_KEY`, si no, Gemini directo.
 */
export const AGENT_PROVIDER_IDS = [
  'auto',
  'gemini',
  'openrouter',
  'openai',
  'anthropic',
  'groq',
  'mistral',
  'deepseek',
  'ollama',
] as const;
export const agentProviderSchema = z.enum(AGENT_PROVIDER_IDS);
export type AgentProviderId = z.infer<typeof agentProviderSchema>;

/** Un proveedor real (todos menos "auto"), que es el único con endpoint y clave propios. */
export type RealAgentProviderId = Exclude<AgentProviderId, 'auto'>;

export interface AgentProviderMeta {
  label: string;
  /** Variable de entorno donde vive la clave de este proveedor. */
  envKey: string;
  /** Si hace falta la propia clave para pedir la lista de modelos (algunos exponen un endpoint público). */
  modelsNeedKey: boolean;
  /** Placeholder del campo de clave en Ajustes. */
  keyPlaceholder: string;
  /** true: funciona sin clave (Ollama local; la clave solo hace falta para un servidor remoto). */
  keyOptional?: boolean;
  defaultModel: string;
  /** Color de marca, para la tarjeta del proveedor en Ajustes. */
  color: string;
}

export const AGENT_PROVIDER_META: Record<RealAgentProviderId, AgentProviderMeta> = {
  gemini: {
    label: 'Google Gemini',
    envKey: 'GEMINI_API_KEY',
    modelsNeedKey: true,
    keyPlaceholder: 'AIzaSy...',
    defaultModel: 'gemini-2.5-pro',
    color: '#4285f4',
  },
  openrouter: {
    label: 'OpenRouter',
    envKey: 'OPENROUTER_API_KEY',
    modelsNeedKey: false,
    keyPlaceholder: 'sk-or-v1-...',
    defaultModel: 'google/gemini-2.5-pro',
    color: '#6b4fbb',
  },
  openai: {
    label: 'OpenAI',
    envKey: 'OPENAI_API_KEY',
    modelsNeedKey: true,
    keyPlaceholder: 'sk-...',
    defaultModel: 'gpt-4.1',
    color: '#10a37f',
  },
  anthropic: {
    label: 'Anthropic (Claude)',
    envKey: 'ANTHROPIC_API_KEY',
    modelsNeedKey: true,
    keyPlaceholder: 'sk-ant-...',
    defaultModel: 'claude-sonnet-4-5',
    color: '#d97757',
  },
  groq: {
    label: 'Groq',
    envKey: 'GROQ_API_KEY',
    modelsNeedKey: true,
    keyPlaceholder: 'gsk_...',
    defaultModel: 'llama-3.3-70b-versatile',
    color: '#f55036',
  },
  mistral: {
    label: 'Mistral',
    envKey: 'MISTRAL_API_KEY',
    modelsNeedKey: true,
    keyPlaceholder: 'clave de la consola de Mistral',
    defaultModel: 'mistral-large-latest',
    color: '#ff7000',
  },
  deepseek: {
    label: 'DeepSeek',
    envKey: 'DEEPSEEK_API_KEY',
    modelsNeedKey: true,
    keyPlaceholder: 'sk-...',
    color: '#4d6bfe',
    defaultModel: 'deepseek-chat',
  },
  ollama: {
    label: 'Ollama (local)',
    envKey: 'OLLAMA_API_KEY',
    modelsNeedKey: false,
    keyPlaceholder: 'Opcional: solo para un servidor Ollama remoto',
    keyOptional: true,
    defaultModel: 'llama3',
    color: '#3a3a3a',
  },
};

/** Un modelo que ofrece un proveedor, para el selector de Ajustes. */
export const providerModelSchema = z.object({ id: z.string(), label: z.string().optional() });
export type ProviderModel = z.infer<typeof providerModelSchema>;

export const providerModelListSchema = z.object({ models: z.array(providerModelSchema) });
export type ProviderModelList = z.infer<typeof providerModelListSchema>;
