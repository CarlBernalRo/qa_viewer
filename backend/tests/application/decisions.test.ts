import { describe, expect, it } from 'vitest';
import { createUseCases } from '../../src/application/index.js';
import { NotFoundError } from '../../src/domain/errors.js';
import { createTestDeps } from '../fakes.js';
import { sampleInput } from '../samples.js';

async function setupWithFinding() {
  const deps = createTestDeps();
  const useCases = createUseCases(deps);
  const session = await useCases.createSession.execute(sampleInput());
  await useCases.startRecording.execute(session.id);
  deps.recorder.sink?.onEvent({
    kind: 'exception',
    pageId: 'p1',
    message: 'TypeError: boom',
  });
  await useCases.stopRecording.execute(session.id);
  const analysis = await useCases.analyzeSession.execute(session.id);
  const finding = analysis.findings[0];
  if (!finding) throw new Error('se esperaba al menos un hallazgo en la sesión de prueba');
  return { useCases, sessionId: session.id, findingId: finding.id };
}

describe('decidir sobre un hallazgo', () => {
  it('confirma un hallazgo y la decisión queda en el siguiente análisis', async () => {
    const { useCases, sessionId, findingId } = await setupWithFinding();
    const result = await useCases.setFindingDecision.execute(sessionId, findingId, { decision: 'confirmed' });
    expect(result.findings.find((f) => f.id === findingId)?.decision?.decision).toBe('confirmed');

    const again = await useCases.analyzeSession.execute(sessionId);
    expect(again.findings.find((f) => f.id === findingId)?.decision?.decision).toBe('confirmed');
  });

  it('descarta un hallazgo y guarda la nota', async () => {
    const { useCases, sessionId, findingId } = await setupWithFinding();
    const result = await useCases.setFindingDecision.execute(sessionId, findingId, {
      decision: 'dismissed',
      note: 'Es un error esperado en este flujo de prueba.',
    });
    const decided = result.findings.find((f) => f.id === findingId);
    expect(decided?.decision).toMatchObject({ decision: 'dismissed', note: 'Es un error esperado en este flujo de prueba.' });
  });

  it('limpia una decisión anterior con decision: null', async () => {
    const { useCases, sessionId, findingId } = await setupWithFinding();
    await useCases.setFindingDecision.execute(sessionId, findingId, { decision: 'confirmed' });
    const cleared = await useCases.setFindingDecision.execute(sessionId, findingId, { decision: null });
    expect(cleared.findings.find((f) => f.id === findingId)?.decision).toBeUndefined();
  });

  it('rechaza decidir sobre un hallazgo que no existe en la sesión', async () => {
    const { useCases, sessionId } = await setupWithFinding();
    await expect(
      useCases.setFindingDecision.execute(sessionId, 'no-existe', { decision: 'confirmed' }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
