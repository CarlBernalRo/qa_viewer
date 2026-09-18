import { afterEach, describe, expect, it, vi } from 'vitest';
import { ListProviderModels } from '../../src/application/use-cases/provider-models.js';
import { DomainError } from '../../src/domain/errors.js';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('ListProviderModels', () => {
  it('OpenRouter no necesita clave y usa el formato {data: [{id}]}', async () => {
    const fetcher = vi.fn(async () => json({ data: [{ id: 'google/gemini-2.5-pro' }, { id: 'openai/gpt-4.1' }] })) as unknown as typeof fetch;
    const models = await new ListProviderModels(fetcher).execute('openrouter');
    expect(models).toEqual([{ id: 'google/gemini-2.5-pro' }, { id: 'openai/gpt-4.1' }]);
  });

  it('sin clave guardada, un proveedor que la necesita explica qué falta en vez de llamar a la red', async () => {
    const fetcher = vi.fn() as unknown as typeof fetch;
    await expect(new ListProviderModels(fetcher).execute('openai')).rejects.toThrow(DomainError);
    await expect(new ListProviderModels(fetcher).execute('openai')).rejects.toThrow('Guarda la clave de OpenAI');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('con clave, manda el Bearer correcto a OpenAI', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'sk-test');
    const fetcher = vi.fn(async () => json({ data: [{ id: 'gpt-4.1' }] })) as unknown as typeof fetch;
    const models = await new ListProviderModels(fetcher).execute('openai');
    expect(models).toEqual([{ id: 'gpt-4.1' }]);
    const [, init] = (fetcher as unknown as { mock: { calls: unknown[][] } }).mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk-test');
  });

  it('Gemini limpia el prefijo "models/" del nombre', async () => {
    vi.stubEnv('GEMINI_API_KEY', 'g-key');
    const fetcher = vi.fn(async () => json({ models: [{ name: 'models/gemini-2.5-pro', displayName: 'Gemini 2.5 Pro' }] })) as unknown as typeof fetch;
    const models = await new ListProviderModels(fetcher).execute('gemini');
    expect(models).toEqual([{ id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' }]);
  });

  it('Ollama no necesita clave y lee {models: [{name}]}', async () => {
    const fetcher = vi.fn(async () => json({ models: [{ name: 'llama3:latest' }] })) as unknown as typeof fetch;
    const models = await new ListProviderModels(fetcher).execute('ollama');
    expect(models).toEqual([{ id: 'llama3:latest' }]);
  });

  it('un HTTP de error se traduce a un mensaje claro', async () => {
    vi.stubEnv('GROQ_API_KEY', 'g');
    const fetcher = vi.fn(async () => json({}, 500)) as unknown as typeof fetch;
    await expect(new ListProviderModels(fetcher).execute('groq')).rejects.toThrow('HTTP 500');
  });
});
