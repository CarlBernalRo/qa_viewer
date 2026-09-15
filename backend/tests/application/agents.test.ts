import type { AgentRun, LeadReport, SpecialistReport } from '@rastro/shared';
import { describe, expect, it } from 'vitest';
import { createUseCases } from '../../src/application/index.js';
import { FeatureNotAvailableError, InvalidStateError } from '../../src/domain/errors.js';
import { createTestDeps, FakeAgentModel } from '../fakes.js';
import { sampleInput } from '../samples.js';

const specialist = (summary: string): SpecialistReport => ({
  summary,
  criteria: [{ criterionId: 'CA1', assessment: 'supports_fail', reason: 'El pago devolvió 500', evidence: ['E1'] }],
  observations: [],
});

const lead: LeadReport = {
  summary: 'El pago falla del lado del servidor.',
  verdicts: [
    { criterionId: 'CA1', verdict: 'fail', confidence: 'high', rationale: 'POST /api/pay devolvió 500 (E1).', evidence: ['E1', 'E999'] },
    { criterionId: 'CA9', verdict: 'pass', confidence: 'low', rationale: 'Criterio que no existe.', evidence: [] },
  ],
  observations: [
    {
      title: 'La pantalla no informa que el pago falló',
      severity: 'high',
      detail: 'Tras el 500 no hay mensaje de error visible.',
      recommendation: 'Mostrar el error al usuario.',
      criterionId: 'CA2',
      evidence: ['E1'],
      agents: ['api', 'frontend', 'lead'],
    },
  ],
};

async function recorded(model: FakeAgentModel | null) {
  const deps = createTestDeps();
  deps.agentModel = model;
  const useCases = createUseCases(deps);
  const session = await useCases.createSession.execute(sampleInput());
  await useCases.startRecording.execute(session.id);
  deps.recorder.sink?.onEvent({
    kind: 'http-request',
    pageId: 'p1',
    requestId: 'q1',
    method: 'POST',
    url: 'https://qa.mercadito.test/api/pay',
    resourceType: 'Fetch',
    headers: {},
  });
  deps.recorder.sink?.onEvent({
    kind: 'http-response',
    pageId: 'p1',
    requestId: 'q1',
    status: 500,
    statusText: 'Internal Server Error',
    mimeType: 'application/json',
    headers: {},
    body: '{"error":"PAYMENT_TIMEOUT"}',
  });
  deps.recorder.sink?.onEvent({ kind: 'exception', pageId: 'p1', message: 'TypeError: order is undefined' });
  await useCases.stopRecording.execute(session.id);
  const eventIds = new Set((await useCases.getSessionEvents.execute(session.id)).map((event) => event.id));
  return { deps, useCases, id: session.id, eventIds };
}

describe('agentes', () => {
  it('corre los tres agentes con el mismo resumen y guarda propuestas con evidencia real', async () => {
    const model = new FakeAgentModel({ api: specialist('Falla el POST'), frontend: specialist('Excepción al pagar'), lead });
    const { useCases, id, eventIds } = await recorded(model);

    const started = await useCases.startAgentRun.execute(id);
    expect(started.status).toBe('running');
    await useCases.startAgentRun.settled(id);
    const [run] = await useCases.listAgentRuns.execute(id);

    expect(run?.status).toBe('completed');
    expect(run?.steps.map((step) => [step.agentId, step.status])).toEqual([
      ['api', 'done'],
      ['frontend', 'done'],
      ['lead', 'done'],
    ]);
    expect(run?.summary).toBe('El pago falla del lado del servidor.');
    // CA9 no existe y E999 es inventada: se descartan.
    expect(run?.proposals.map((proposal) => [proposal.criterionId, proposal.verdict])).toEqual([['CA1', 'fail']]);
    expect(run?.proposals[0]?.evidence).toHaveLength(1);
    expect(eventIds.has(run?.proposals[0]?.evidence[0] ?? '')).toBe(true);
    expect(run?.findings[0]).toMatchObject({ agents: ['api', 'frontend'], criterionId: 'CA2', severity: 'high' });
    expect(run?.usage).toEqual({ inputTokens: 3000, outputTokens: 600, cacheReadTokens: 1600, cacheWriteTokens: 800 });

    // El resumen es idéntico para los tres (para que se cachee) y cada agente recibe su evidencia.
    expect(new Set(model.calls.map((call) => call.brief)).size).toBe(1);
    expect(model.calls.map((call) => call.agentId)).toEqual(['api', 'frontend', 'lead']);
    expect(model.calls[0]?.task).toContain('POST /api/pay');
    expect(model.calls[1]?.task).toContain('TypeError: order is undefined');
    expect(model.calls[2]?.task).toContain('"summary": "Falla el POST"');
  });

  it('si un agente falla, la corrida queda fallida y dice cuál', async () => {
    const model = new FakeAgentModel({ api: specialist('ok'), frontend: specialist('ok'), lead });
    model.failOn = 'frontend';
    const { useCases, id } = await recorded(model);
    await useCases.startAgentRun.execute(id);
    await useCases.startAgentRun.settled(id);
    const [run] = await useCases.listAgentRuns.execute(id);
    expect(run?.status).toBe('failed');
    expect(run?.error).toBe('El agente frontend no respondió');
    expect(run?.steps.map((step) => step.status)).toEqual(['done', 'failed', 'pending']);
  });

  it('reintentar retoma desde el agente que falló, con el mismo resumen y la misma evidencia', async () => {
    const model = new FakeAgentModel({ api: specialist('Falla el POST'), frontend: specialist('Excepción al pagar'), lead });
    model.failOn = 'frontend';
    const { useCases, id, eventIds } = await recorded(model);
    const failed = await useCases.startAgentRun.execute(id);
    await useCases.startAgentRun.settled(id);

    // El QA cambia un veredicto entre medio: el reintento usa el resumen guardado, no uno nuevo.
    await useCases.setCriterionVerdict.execute(id, 'CA2', { verdict: 'pass' });
    model.failOn = null;
    const retried = await useCases.startAgentRun.retry(id, failed.id);
    expect(retried).toMatchObject({ id: failed.id, status: 'running' });
    await useCases.startAgentRun.settled(id);

    const runs = await useCases.listAgentRuns.execute(id);
    expect(runs).toHaveLength(1);
    expect(runs[0]?.status).toBe('completed');
    expect(runs[0]?.steps.map((step) => step.status)).toEqual(['done', 'done', 'done']);
    // API REST respondió en el primer intento: no se lo vuelve a consultar.
    expect(model.calls.map((call) => call.agentId)).toEqual(['api', 'frontend', 'frontend', 'lead']);
    expect(new Set(model.calls.map((call) => call.brief)).size).toBe(1);
    expect(runs[0]?.proposals[0]?.evidence.every((eventId) => eventIds.has(eventId))).toBe(true);
    expect(runs[0]?.usage.inputTokens).toBe(3000);
  });

  it('un análisis sin punto de control (versión anterior) se reintenta desde cero', async () => {
    const model = new FakeAgentModel({ api: specialist('ok'), frontend: specialist('ok'), lead });
    const { deps, useCases, id } = await recorded(model);
    await deps.agentRuns.save({
      id: 'viejo',
      sessionId: id,
      status: 'failed',
      model: 'gemini-2.5-pro',
      startedAt: '2026-09-14T09:00:00.000Z',
      steps: [{ agentId: 'api', status: 'failed' }],
      proposals: [],
      findings: [],
      usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
    });
    const retried = await useCases.startAgentRun.retry(id, 'viejo');
    expect(retried.id).not.toBe('viejo');
    await useCases.startAgentRun.settled(id);
    expect(model.calls.map((call) => call.agentId)).toEqual(['api', 'frontend', 'lead']);
  });

  it('no reintenta un análisis que ya terminó ni uno que no existe', async () => {
    const model = new FakeAgentModel({ api: specialist('ok'), frontend: specialist('ok'), lead });
    const { useCases, id } = await recorded(model);
    const run = await useCases.startAgentRun.execute(id);
    await useCases.startAgentRun.settled(id);
    await expect(useCases.startAgentRun.retry(id, run.id)).rejects.toBeInstanceOf(InvalidStateError);
    await expect(useCases.startAgentRun.retry(id, 'no-existe')).rejects.toThrow('No existe');
  });

  it('sin credenciales avisa cómo configurarlos, sin llamar a nada', async () => {
    const { useCases, id } = await recorded(null);
    expect(useCases.getAgentStatus.execute()).toMatchObject({
      available: false,
      provider: 'Google Gemini',
      model: 'gemini-2.5-pro',
    });
    expect(useCases.getAgentStatus.execute().reason).toContain('GEMINI_API_KEY');
    await expect(useCases.startAgentRun.execute(id)).rejects.toBeInstanceOf(FeatureNotAvailableError);
  });

  it('no deja lanzar dos análisis a la vez ni analizar una sesión sin grabar', async () => {
    const model = new FakeAgentModel({ api: specialist('ok'), frontend: specialist('ok'), lead });
    const { deps, useCases, id } = await recorded(model);
    await useCases.startAgentRun.execute(id);
    await expect(useCases.startAgentRun.execute(id)).rejects.toBeInstanceOf(InvalidStateError);
    await useCases.startAgentRun.settled(id);

    const draft = await useCases.createSession.execute(sampleInput());
    await expect(useCases.startAgentRun.execute(draft.id)).rejects.toBeInstanceOf(InvalidStateError);
    expect(deps.agentRuns.bySession.get(draft.id)).toBeUndefined();
  });

  it('una corrida que quedó "en curso" tras reiniciar se muestra como interrumpida', async () => {
    const { deps, useCases, id } = await recorded(new FakeAgentModel());
    const orphan: AgentRun = {
      id: 'r1',
      sessionId: id,
      status: 'running',
      model: 'gemini-2.5-pro',
      startedAt: '2026-09-14T10:00:00.000Z',
      steps: [{ agentId: 'api', status: 'running' }],
      proposals: [],
      findings: [],
      usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
    };
    await deps.agentRuns.save(orphan);
    const [run] = await useCases.listAgentRuns.execute(id);
    expect(run?.status).toBe('failed');
    expect(run?.error).toContain('se interrumpió');
  });
});
