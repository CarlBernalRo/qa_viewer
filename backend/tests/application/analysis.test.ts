import { describe, expect, it } from 'vitest';
import { createUseCases } from '../../src/application/index.js';
import { InvalidStateError } from '../../src/domain/errors.js';
import { createTestDeps } from '../fakes.js';
import { sampleInput } from '../samples.js';

describe('analizar sesión', () => {
  it('no analiza una sesión que todavía no se grabó', async () => {
    const useCases = createUseCases(createTestDeps());
    const session = await useCases.createSession.execute(sampleInput());
    await expect(useCases.analyzeSession.execute(session.id)).rejects.toBeInstanceOf(InvalidStateError);
  });

  it('analiza lo grabado, con los datos ya ocultos', async () => {
    const deps = createTestDeps();
    const useCases = createUseCases(deps);
    const session = await useCases.createSession.execute(sampleInput());
    await useCases.startRecording.execute(session.id);

    deps.clock.advance(1000);
    deps.recorder.sink?.onEvent({
      kind: 'http-request',
      pageId: 'p1',
      requestId: 'r1',
      method: 'POST',
      url: 'https://qa.mercadito.test/api/orders?access_token=abc',
      resourceType: 'Fetch',
      headers: {},
    });
    deps.clock.advance(200);
    deps.recorder.sink?.onEvent({
      kind: 'http-response',
      pageId: 'p1',
      requestId: 'r1',
      status: 500,
      statusText: 'Internal Server Error',
      mimeType: 'application/json',
      headers: {},
    });
    await useCases.stopRecording.execute(session.id);

    const analysis = await useCases.analyzeSession.execute(session.id);
    expect(analysis.findings.map((finding) => finding.ruleId)).toEqual(['http-server-error', 'token-in-url']);
    expect(analysis.findings.find((finding) => finding.ruleId === 'token-in-url')?.detail).toContain('quedó oculto');
  });
});
