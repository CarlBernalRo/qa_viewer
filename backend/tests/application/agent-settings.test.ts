import { describe, expect, it } from 'vitest';
import { createUseCases } from '../../src/application/index.js';
import { createTestDeps } from '../fakes.js';

describe('configuración de agentes', () => {
  it('sin overrides, devuelve vacío; al guardar uno, se puede leer de vuelta', async () => {
    const useCases = createUseCases(createTestDeps());
    expect(await useCases.getAgentSettings.execute()).toEqual({});

    await useCases.updateAgentSettings.execute('api', {
      color: '#123456',
      mainObjective: 'Revisa sobre todo los endpoints de pago.',
      secondaryObjectives: ['No repitas hallazgos de seguridad.'],
    });

    const all = await useCases.getAgentSettings.execute();
    expect(all.api).toEqual({
      color: '#123456',
      mainObjective: 'Revisa sobre todo los endpoints de pago.',
      secondaryObjectives: ['No repitas hallazgos de seguridad.'],
    });
    expect(all.frontend).toBeUndefined();
  });

  it('guardar de nuevo reemplaza el override anterior del mismo agente, sin tocar los demás', async () => {
    const useCases = createUseCases(createTestDeps());
    await useCases.updateAgentSettings.execute('api', { color: '#111111' });
    await useCases.updateAgentSettings.execute('frontend', { color: '#222222' });
    await useCases.updateAgentSettings.execute('api', { color: '#333333' });

    const all = await useCases.getAgentSettings.execute();
    expect(all.api).toEqual({ color: '#333333' });
    expect(all.frontend).toEqual({ color: '#222222' });
  });
});
