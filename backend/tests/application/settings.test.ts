import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GetAppSettings, UpdateAppSettings } from '../../src/application/use-cases/settings.js';

let dir: string;
let envPath: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'rastro-settings-'));
  envPath = join(dir, '.env');
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('GetAppSettings', () => {
  it('sin archivo .env, devuelve todo vacío con "auto" como proveedor', async () => {
    expect(await new GetAppSettings(envPath).execute()).toEqual({
      agentProvider: 'auto',
      agentModel: '',
      geminiApiKey: '',
      openrouterApiKey: '',
      openaiApiKey: '',
      anthropicApiKey: '',
      groqApiKey: '',
      mistralApiKey: '',
      deepseekApiKey: '',
      ollamaApiKey: '',
    });
  });

  it('un proveedor inválido en el archivo cae a "auto" en vez de romper', async () => {
    await new UpdateAppSettings(envPath).execute({ agentProvider: 'openai', openaiApiKey: 'sk-1' });
    // Se corrompe el archivo a mano, como si alguien lo hubiera editado con algo inválido.
    const { readFile, writeFile } = await import('node:fs/promises');
    const content = await readFile(envPath, 'utf-8');
    await writeFile(envPath, content.replace('RASTRO_AGENT_PROVIDER=openai', 'RASTRO_AGENT_PROVIDER=lo-que-sea'), 'utf-8');
    expect((await new GetAppSettings(envPath).execute()).agentProvider).toBe('auto');
  });
});

describe('UpdateAppSettings', () => {
  it('guarda el proveedor y su clave, y los vuelve a leer tal cual', async () => {
    await new UpdateAppSettings(envPath).execute({ agentProvider: 'anthropic', agentModel: 'claude-sonnet-4-5', anthropicApiKey: 'sk-ant-1' });
    expect(await new GetAppSettings(envPath).execute()).toMatchObject({
      agentProvider: 'anthropic',
      agentModel: 'claude-sonnet-4-5',
      anthropicApiKey: 'sk-ant-1',
    });
  });

  it('no toca las claves de los demás proveedores al guardar una sola', async () => {
    const useCase = new UpdateAppSettings(envPath);
    await useCase.execute({ agentProvider: 'gemini', geminiApiKey: 'g-1' });
    await useCase.execute({ agentProvider: 'openai', openaiApiKey: 'o-1' });
    const settings = await new GetAppSettings(envPath).execute();
    expect(settings.geminiApiKey).toBe('g-1');
    expect(settings.openaiApiKey).toBe('o-1');
    expect(settings.agentProvider).toBe('openai');
  });

  it('reemplaza una clave existente en vez de duplicar la línea', async () => {
    const useCase = new UpdateAppSettings(envPath);
    await useCase.execute({ agentProvider: 'groq', groqApiKey: 'primera' });
    await useCase.execute({ agentProvider: 'groq', groqApiKey: 'segunda' });
    const { readFile } = await import('node:fs/promises');
    const content = await readFile(envPath, 'utf-8');
    expect(content.match(/GROQ_API_KEY=/g)).toHaveLength(1);
    expect(content).toContain('GROQ_API_KEY=segunda');
  });
});
