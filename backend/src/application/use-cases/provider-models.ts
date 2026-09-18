import { AGENT_PROVIDER_META, type ProviderModel, type RealAgentProviderId } from '@rastro/shared';
import { DomainError } from '../../domain/errors.js';
import { ollamaBaseUrl, providerApiKey } from '../../infrastructure/config/env.js';

type Fetcher = typeof fetch;

function asArray(value: unknown, path: readonly string[]): unknown[] {
  let current: unknown = value;
  for (const key of path) {
    if (!current || typeof current !== 'object') return [];
    current = (current as Record<string, unknown>)[key];
  }
  return Array.isArray(current) ? current : [];
}

/** Lista los modelos que ofrece cada proveedor, para el selector de Ajustes. Sin caché: es una lista corta y cambia poco, no vale la pena la complejidad. */
export class ListProviderModels {
  constructor(private readonly fetcher: Fetcher = fetch) {}

  async execute(provider: RealAgentProviderId): Promise<ProviderModel[]> {
    switch (provider) {
      case 'openrouter':
        return this.openAiStyleList('https://openrouter.ai/api/v1/models', {});
      case 'openai':
        return this.withKey(provider, (key) =>
          this.openAiStyleList('https://api.openai.com/v1/models', { Authorization: `Bearer ${key}` }),
        );
      case 'groq':
        return this.withKey(provider, (key) =>
          this.openAiStyleList('https://api.groq.com/openai/v1/models', { Authorization: `Bearer ${key}` }),
        );
      case 'mistral':
        return this.withKey(provider, (key) =>
          this.openAiStyleList('https://api.mistral.ai/v1/models', { Authorization: `Bearer ${key}` }),
        );
      case 'deepseek':
        return this.withKey(provider, (key) =>
          this.openAiStyleList('https://api.deepseek.com/models', { Authorization: `Bearer ${key}` }),
        );
      case 'anthropic':
        return this.withKey(provider, async (key) => {
          const payload = await this.fetchJson('https://api.anthropic.com/v1/models', {
            'x-api-key': key,
            'anthropic-version': '2023-06-01',
          });
          return asArray(payload, ['data']).flatMap((item) => {
            if (!item || typeof item !== 'object' || !('id' in item)) return [];
            const { id, display_name: label } = item as { id: unknown; display_name?: unknown };
            return typeof id === 'string' ? [{ id, ...(typeof label === 'string' ? { label } : {}) }] : [];
          });
        });
      case 'gemini':
        return this.withKey(provider, async (key) => {
          const payload = await this.fetchJson(
            `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`,
            {},
          );
          return asArray(payload, ['models']).flatMap((item) => {
            if (!item || typeof item !== 'object' || !('name' in item)) return [];
            const { name, displayName: label } = item as { name: unknown; displayName?: unknown };
            if (typeof name !== 'string') return [];
            return [{ id: name.replace(/^models\//, ''), ...(typeof label === 'string' ? { label } : {}) }];
          });
        });
      case 'ollama': {
        const payload = await this.fetchJson(`${ollamaBaseUrl()}/api/tags`, {});
        return asArray(payload, ['models']).flatMap((item) => {
          if (!item || typeof item !== 'object' || !('name' in item)) return [];
          const { name } = item as { name: unknown };
          return typeof name === 'string' ? [{ id: name }] : [];
        });
      }
    }
  }

  private async withKey(
    provider: RealAgentProviderId,
    run: (key: string) => Promise<ProviderModel[]>,
  ): Promise<ProviderModel[]> {
    const key = providerApiKey(provider);
    if (!key) {
      throw new DomainError('PROVIDER_KEY_MISSING', `Guarda la clave de ${AGENT_PROVIDER_META[provider].label} antes de pedir sus modelos.`);
    }
    return run(key);
  }

  private async openAiStyleList(url: string, headers: Record<string, string>): Promise<ProviderModel[]> {
    const payload = await this.fetchJson(url, headers);
    return asArray(payload, ['data']).flatMap((item) => {
      if (!item || typeof item !== 'object' || !('id' in item)) return [];
      const { id } = item as { id: unknown };
      return typeof id === 'string' ? [{ id }] : [];
    });
  }

  private async fetchJson(url: string, headers: Record<string, string>): Promise<unknown> {
    let response: Response;
    try {
      response = await this.fetcher(url, { headers, signal: AbortSignal.timeout(15_000) });
    } catch {
      throw new DomainError('PROVIDER_MODELS_UNREACHABLE', `No se pudo conectar a ${url}.`);
    }
    if (!response.ok) {
      throw new DomainError('PROVIDER_MODELS_FAILED', `No se pudo obtener la lista de modelos (HTTP ${response.status}).`);
    }
    return response.json();
  }
}
