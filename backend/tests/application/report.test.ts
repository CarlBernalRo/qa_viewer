import { describe, expect, it } from 'vitest';
import { createUseCases, reportFileName } from '../../src/application/index.js';
import { InvalidStateError, NotFoundError } from '../../src/domain/errors.js';
import { createTestDeps } from '../fakes.js';
import { sampleInput } from '../samples.js';

/** Una sesión grabada con una excepción: produce un hallazgo. */
async function recorded() {
  const deps = createTestDeps();
  const useCases = createUseCases(deps);
  const session = await useCases.createSession.execute(sampleInput());
  await useCases.startRecording.execute(session.id);
  deps.recorder.sink?.onEvent({ kind: 'exception', pageId: 'p1', message: 'TypeError: boom' });
  await useCases.stopRecording.execute(session.id);
  return { deps, useCases, sessionId: session.id };
}

describe('informe PDF', () => {
  it('exporta el objetivo y el análisis con un nombre de archivo estable', async () => {
    const { deps, useCases, sessionId } = await recorded();
    const report = await useCases.exportSessionReport.execute(sessionId);
    expect(report).toMatchObject({
      fileName: 'pago-con-tarjeta-v2-14-0-00000000.pdf',
      path: '/informes/pago-con-tarjeta-v2-14-0-00000000.pdf',
      findings: 1,
    });
    const [rendered] = deps.renderer.rendered;
    expect(rendered?.session.objective.sessionName).toBe('Pago con tarjeta · v2.14.0');
    expect(rendered?.analysis.findings.map((finding) => finding.ruleId)).toEqual(['uncaught-exception']);
  });

  it('no cuenta los hallazgos descartados', async () => {
    const { useCases, sessionId } = await recorded();
    const [finding] = (await useCases.analyzeSession.execute(sessionId)).findings;
    await useCases.setFindingDecision.execute(sessionId, finding?.id ?? '', { decision: 'dismissed' });
    expect((await useCases.exportSessionReport.execute(sessionId)).findings).toBe(0);
  });

  it('no exporta una sesión que todavía no se grabó', async () => {
    const useCases = createUseCases(createTestDeps());
    const session = await useCases.createSession.execute(sampleInput());
    await expect(useCases.exportSessionReport.execute(session.id)).rejects.toBeInstanceOf(InvalidStateError);
  });

  it('abre el informe o lo muestra en su carpeta, y avisa si todavía no se exportó', async () => {
    const { deps, useCases, sessionId } = await recorded();
    await expect(useCases.openSessionReport.execute(sessionId, false)).rejects.toBeInstanceOf(NotFoundError);
    await useCases.exportSessionReport.execute(sessionId);
    await useCases.openSessionReport.execute(sessionId, false);
    await useCases.openSessionReport.execute(sessionId, true);
    expect(deps.opener.calls).toEqual([
      { action: 'open', path: '/informes/pago-con-tarjeta-v2-14-0-00000000.pdf' },
      { action: 'reveal', path: '/informes/pago-con-tarjeta-v2-14-0-00000000.pdf' },
    ]);
  });

  it('arma el nombre sin acentos ni símbolos', () => {
    expect(reportFileName('ses_1a2b3c4d-0000-4000-8000-000000000000', 'Revisión de pagos ñandú (QA)')).toBe(
      'revision-de-pagos-nandu-qa-1a2b3c4d.pdf',
    );
    expect(reportFileName('ses_1a2b3c4d-0000-4000-8000-000000000000', '¿¿??')).toBe('sesion-1a2b3c4d.pdf');
  });
});
