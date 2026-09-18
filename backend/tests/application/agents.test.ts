import type { AgentId, AgentRun, LeadReport, SpecialistReport } from '@rastro/shared';
import { describe, expect, it } from 'vitest';
import { createUseCases } from '../../src/application/index.js';
import { FeatureNotAvailableError, InvalidStateError } from '../../src/domain/errors.js';
import { createTestDeps, FakeAgentModel } from '../fakes.js';
import { sampleInput } from '../samples.js';

const specialist = (summary: string, approvalPercentage = 40): SpecialistReport => ({
  summary,
  criteria: [{ criterionId: 'CA1', assessment: 'supports_fail', reason: 'El pago devolvió 500', evidence: ['E1'] }],
  observations: [],
  approvalPercentage,
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

/** El equipo completo (10 especialistas + QA Lead), todos respondiendo "ok" salvo lo que se pise en overrides. */
function fullTeamModel(overrides: Partial<Record<AgentId, unknown>> = {}): FakeAgentModel {
  return new FakeAgentModel({
    api: specialist('api ok'),
    frontend: specialist('frontend ok'),
    sec: specialist('sec ok'),
    a11y: specialist('a11y ok'),
    perf: specialist('perf ok'),
    rt: specialist('rt ok'),
    func: specialist('func ok'),
    env: specialist('env ok'),
    ux: specialist('ux ok'),
    reg: specialist('reg ok'),
    lead,
    ...overrides,
  });
}

const FULL_TEAM_ORDER: readonly AgentId[] = [
  'api',
  'frontend',
  'sec',
  'a11y',
  'perf',
  'rt',
  'func',
  'env',
  'ux',
  'reg',
  'lead',
];

async function recorded(model: FakeAgentModel | null, captureOverrides: Parameters<typeof sampleInput>[0] = {}) {
  const deps = createTestDeps();
  deps.agentModel = model;
  const useCases = createUseCases(deps);
  const session = await useCases.createSession.execute(sampleInput(captureOverrides));
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
  it('corre el equipo completo con el mismo resumen y guarda propuestas con evidencia real', async () => {
    const model = fullTeamModel({ api: specialist('Falla el POST'), frontend: specialist('Excepción al pagar') });
    const { useCases, id, eventIds } = await recorded(model);

    const started = await useCases.startAgentRun.execute(id);
    expect(started.status).toBe('running');
    await useCases.startAgentRun.settled(id);
    const [run] = await useCases.listAgentRuns.execute(id);

    expect(run?.status).toBe('completed');
    expect(run?.steps.map((step) => step.agentId)).toEqual(FULL_TEAM_ORDER);
    expect(run?.steps.every((step) => step.status === 'done')).toBe(true);
    expect(run?.summary).toBe('El pago falla del lado del servidor.');
    // CA9 no existe y E999 es inventada: se descartan.
    expect(run?.proposals.map((proposal) => [proposal.criterionId, proposal.verdict])).toEqual([['CA1', 'fail']]);
    expect(run?.proposals[0]?.evidence).toHaveLength(1);
    expect(eventIds.has(run?.proposals[0]?.evidence[0] ?? '')).toBe(true);
    expect(run?.findings[0]).toMatchObject({ agents: ['api', 'frontend'], criterionId: 'CA2', severity: 'high' });
    // El desglose por criterio de cada especialista se guarda con evidencia ya resuelta a eventos reales.
    const apiStep = run?.steps.find((step) => step.agentId === 'api');
    expect(apiStep?.criteria).toMatchObject([{ criterionId: 'CA1', assessment: 'supports_fail', reason: 'El pago devolvió 500' }]);
    expect(apiStep?.criteria?.[0]?.evidence).toHaveLength(1);
    expect(eventIds.has(apiStep?.criteria?.[0]?.evidence[0] ?? '')).toBe(true);
    expect(apiStep?.approvalPercentage).toBe(40);
    // 10 especialistas + QA Lead = 11 llamadas; solo la primera (api) escribe caché, el resto lo lee.
    expect(run?.usage).toEqual({ inputTokens: 11000, outputTokens: 2200, cacheReadTokens: 8000, cacheWriteTokens: 800 });

    // El resumen es idéntico para todos (para que se cachee) y cada agente recibe su evidencia.
    expect(new Set(model.calls.map((call) => call.brief)).size).toBe(1);
    expect(model.calls.map((call) => call.agentId)).toEqual(FULL_TEAM_ORDER);
    expect(model.calls[0]?.task).toContain('POST /api/pay');
    expect(model.calls[1]?.task).toContain('TypeError: order is undefined');
    expect(model.calls[10]?.task).toContain('"summary":"Falla el POST"');
  });

  it('el override de configuración del agente y la recomendación de la corrida llegan al prompt real', async () => {
    const model = fullTeamModel();
    const { useCases, id } = await recorded(model);
    await useCases.updateAgentSettings.execute('api', {
      mainObjective: 'Objetivo a medida para API REST.',
      secondaryObjectives: ['Presta atención extra a los reintentos.'],
    });

    await useCases.startAgentRun.execute(id, 'Fíjate especialmente en el checkout.');
    await useCases.startAgentRun.settled(id);

    const apiCall = model.calls.find((call) => call.agentId === 'api');
    expect(apiCall?.task).toContain('Objetivo a medida para API REST.');
    expect(apiCall?.task).toContain('Presta atención extra a los reintentos.');
    // La recomendación de la corrida va en el resumen compartido, no en la tarea de un agente en particular.
    expect(apiCall?.brief).toContain('Fíjate especialmente en el checkout.');

    // Front-end no tiene override propio: sigue usando el rol fijo del catálogo.
    const frontendCall = model.calls.find((call) => call.agentId === 'frontend');
    expect(frontendCall?.task).not.toContain('Objetivo a medida para API REST.');
  });

  it('"Elegir yo" con un solo especialista no consulta a los que no se eligieron', async () => {
    const leadOneSpecialist: LeadReport = { ...lead, observations: [] };
    const model = new FakeAgentModel({ api: specialist('Falla el POST'), lead: leadOneSpecialist });
    // analysisMode "none" para aislar esto de que "manual" ya arranca solo al terminar de grabar
    // (eso se prueba en recording.test.ts); acá interesa que execute() respete la elección.
    const { useCases, id } = await recorded(model, { selectedAgents: ['api'] });

    const started = await useCases.startAgentRun.execute(id);
    expect(started.steps.map((step) => step.agentId)).toEqual(['api', 'lead']);
    await useCases.startAgentRun.settled(id);

    const [run] = await useCases.listAgentRuns.execute(id);
    expect(run?.status).toBe('completed');
    expect(run?.steps.map((step) => [step.agentId, step.status])).toEqual([
      ['api', 'done'],
      ['lead', 'done'],
    ]);
    expect(model.calls.map((call) => call.agentId)).toEqual(['api', 'lead']);
  });

  it('si un agente falla, la corrida queda fallida y dice cuál', async () => {
    const model = fullTeamModel();
    model.failOn = 'frontend';
    const { useCases, id } = await recorded(model);
    await useCases.startAgentRun.execute(id);
    await useCases.startAgentRun.settled(id);
    const [run] = await useCases.listAgentRuns.execute(id);
    expect(run?.status).toBe('failed');
    expect(run?.error).toBe('El agente frontend no respondió');
    expect(run?.steps.map((step) => step.status)).toEqual([
      'done',
      'failed',
      'pending',
      'pending',
      'pending',
      'pending',
      'pending',
      'pending',
      'pending',
      'pending',
      'pending',
    ]);
  });

  it('reintentar retoma desde el agente que falló, con el mismo resumen y la misma evidencia', async () => {
    const model = fullTeamModel({ api: specialist('Falla el POST'), frontend: specialist('Excepción al pagar') });
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
    expect(runs[0]?.steps.every((step) => step.status === 'done')).toBe(true);
    // API REST respondió en el primer intento: no se lo vuelve a consultar.
    expect(model.calls.map((call) => call.agentId)).toEqual([
      'api',
      'frontend',
      'frontend',
      'sec',
      'a11y',
      'perf',
      'rt',
      'func',
      'env',
      'ux',
      'reg',
      'lead',
    ]);
    expect(new Set(model.calls.map((call) => call.brief)).size).toBe(1);
    expect(runs[0]?.proposals[0]?.evidence.every((eventId) => eventIds.has(eventId))).toBe(true);
    // El intento fallido de "frontend" no suma uso: 11 llamadas exitosas (10 especialistas + lead).
    expect(runs[0]?.usage.inputTokens).toBe(11000);
  });

  it('un análisis sin punto de control (versión anterior) se reintenta desde cero', async () => {
    const model = fullTeamModel();
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
    expect(model.calls.map((call) => call.agentId)).toEqual(FULL_TEAM_ORDER);
  });

  it('no reintenta un análisis que ya terminó ni uno que no existe', async () => {
    const model = fullTeamModel();
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
    const model = fullTeamModel();
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
