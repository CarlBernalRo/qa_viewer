import { describe, expect, it } from 'vitest';
import { parseConfig } from '../../src/infrastructure/config/env.js';

const base = { RASTRO_AUTH_TOKEN: 'token-de-prueba-con-mas-de-32-caracteres' };

describe('configuración de los agentes', () => {
  it('sin claves, queda Gemini sin configurar', () => {
    expect(parseConfig(base).agents).toEqual({
      provider: 'gemini',
      providerName: 'Google Gemini',
      model: 'gemini-2.5-pro',
      credentials: false,
    });
  });

  it('con la clave de Gemini usa Gemini directo', () => {
    expect(parseConfig({ ...base, GEMINI_API_KEY: 'g' }).agents).toMatchObject({ provider: 'gemini', credentials: true });
  });

  it('con la clave de OpenRouter la prefiere y traduce el nombre del modelo', () => {
    const agents = parseConfig({ ...base, GEMINI_API_KEY: 'g', OPENROUTER_API_KEY: 'o', RASTRO_AGENT_MODEL: 'gemini-2.5-flash' })
      .agents;
    expect(agents).toEqual({
      provider: 'openrouter',
      providerName: 'OpenRouter',
      model: 'google/gemini-2.5-flash',
      credentials: true,
    });
  });

  it('respeta el proveedor elegido y los modelos con prefijo', () => {
    const forced = parseConfig({ ...base, GEMINI_API_KEY: 'g', OPENROUTER_API_KEY: 'o', RASTRO_AGENT_PROVIDER: 'gemini' });
    expect(forced.agents.provider).toBe('gemini');
    const other = parseConfig({ ...base, OPENROUTER_API_KEY: 'o', RASTRO_AGENT_MODEL: 'openai/gpt-4.1' });
    expect(other.agents.model).toBe('openai/gpt-4.1');
  });

  it('una clave vacía no cuenta como configurada', () => {
    expect(parseConfig({ ...base, OPENROUTER_API_KEY: '   ' }).agents).toMatchObject({ provider: 'gemini', credentials: false });
  });
});
