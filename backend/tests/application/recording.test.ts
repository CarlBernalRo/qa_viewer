import type { LeadReport, SpecialistReport } from '@rastro/shared';
import { describe, expect, it } from 'vitest';
import { createUseCases } from '../../src/application/index.js';
import { DomainError, LimitReachedError } from '../../src/domain/errors.js';
import { REDACTED } from '../../src/domain/redaction/Redactor.js';
import { createTestDeps, FakeAgentModel } from '../fakes.js';
import { sampleInput } from '../samples.js';

async function setup(maxConcurrent = 1) {
  const deps = createTestDeps(maxConcurrent);
  const useCases = createUseCases(deps);
  const session = await useCases.createSession.execute(sampleInput());
  return { deps, useCases, session };
}

describe('crear sesión', () => {
  it('guarda la sesión en borrador', async () => {
    const { session, useCases } = await setup();
    expect(session.status).toBe('draft');
    expect(await useCases.listSessions.execute()).toHaveLength(1);
  });

  it('"Elegir yo" sin ningún agente elegido se rechaza', async () => {
    const { useCases } = await setup();
    await expect(
      useCases.createSession.execute(sampleInput({ analysisMode: 'manual' })),
    ).rejects.toBeInstanceOf(DomainError);
  });

  it('"Elegir yo" con al menos un agente elegido se acepta', async () => {
    const { useCases } = await setup();
    const session = await useCases.createSession.execute(
      sampleInput({ analysisMode: 'manual', selectedAgents: ['api'] }),
    );
    expect(session.capture.selectedAgents).toEqual(['api']);
  });
});

describe('eliminar sesión', () => {
  it('borra una sesión que no está grabando', async () => {
    const { useCases, session } = await setup();
    await useCases.deleteSession.execute(session.id);
    expect(await useCases.listSessions.execute()).toHaveLength(0);
  });

  it('no deja borrar una sesión mientras graba', async () => {
    const { useCases, session } = await setup();
    await useCases.startRecording.execute(session.id);
    await expect(useCases.deleteSession.execute(session.id)).rejects.toThrow('Detén la grabación');
  });
});

describe('grabación', () => {
  it('oculta datos, cuenta eventos y completa la sesión con video al detener', async () => {
    const { deps, useCases, session } = await setup();
    await useCases.startRecording.execute(session.id);

    deps.clock.advance(1500);
    deps.recorder.sink?.onEvent({
      kind: 'http-request',
      pageId: 'p1',
      requestId: 'r1',
      method: 'POST',
      url: 'https://qa.mercadito.test/api/orders?access_token=abc',
      resourceType: 'Fetch',
      headers: { Authorization: 'Bearer secreto' },
      postData: JSON.stringify({ cardNumber: '4242424242424242' }),
    });
    deps.recorder.sink?.onEvent({ kind: 'exception', pageId: 'p1', message: 'TypeError: boom' });

    const stopped = await useCases.stopRecording.execute(session.id);

    expect(stopped.status).toBe('completed');
    expect(stopped.hasVideo).toBe(true);
    expect(stopped.stats).toMatchObject({ requests: 1, errors: 1 });

    const [request] = await useCases.getSessionEvents.execute(session.id, { kinds: ['http-request'] });
    expect(request?.t).toBe(1500);
    expect(request?.kind === 'http-request' && request.headers.Authorization).toBe(REDACTED);
    expect(request?.kind === 'http-request' && request.url).not.toContain('abc');
    expect(deps.notifier.messages.at(-1)).toMatchObject({ type: 'session-status', status: 'completed' });
  });

  it('guarda cuándo empezó el video para alinearlo con los eventos', async () => {
    const { deps, useCases, session } = await setup();
    deps.recorder.videoStartDelayMs = 1200;
    await useCases.startRecording.execute(session.id);
    const stopped = await useCases.stopRecording.execute(session.id);
    expect(stopped.videoOffsetMs).toBe(1200);
  });

  it('si el video no se puede guardar, la sesión se completa igual, sin video', async () => {
    const { deps, useCases, session } = await setup();
    deps.media.failImport = Object.assign(new Error('EBUSY: resource busy or locked'), { code: 'EBUSY' });
    await useCases.startRecording.execute(session.id);
    deps.recorder.sink?.onEvent({ kind: 'navigation', pageId: 'p1', url: 'https://qa.mercadito.test' });
    const stopped = await useCases.stopRecording.execute(session.id);
    expect(stopped.status).toBe('completed');
    expect(stopped.hasVideo).toBe(false);
    expect(await useCases.getSessionEvents.execute(session.id)).toHaveLength(1);
  });

  it('marca la sesión como fallida si el navegador se bloquea', async () => {
    const { deps, useCases, session } = await setup();
    await useCases.startRecording.execute(session.id);
    deps.recorder.end({ reason: 'crashed', error: 'La página se bloqueó.' });
    await deps.registry.get(session.id)?.done;
    await new Promise((resolve) => setTimeout(resolve, 0));
    const result = await useCases.getSession.execute(session.id);
    expect(result.status).toBe('failed');
    expect(result.failureReason).toBe('La página se bloqueó.');
  });

  it('respeta el máximo de grabaciones simultáneas', async () => {
    const { useCases, session } = await setup(1);
    const other = await useCases.createSession.execute(sampleInput());
    await useCases.startRecording.execute(session.id);
    await expect(useCases.startRecording.execute(other.id)).rejects.toBeInstanceOf(LimitReachedError);
  });

  it('si el navegador no abre, la sesión queda fallida y el error se informa', async () => {
    const { deps, useCases, session } = await setup();
    deps.recorder.failWith = new Error('Chromium no está instalado');
    await expect(useCases.startRecording.execute(session.id)).rejects.toBeInstanceOf(DomainError);
    expect((await useCases.getSession.execute(session.id)).status).toBe('failed');
  });

  it('las sesiones que quedaron grabando se recuperan como fallidas', async () => {
    const { deps, useCases, session } = await setup();
    await useCases.startRecording.execute(session.id);
    deps.registry.remove(session.id);
    expect(await useCases.recoverInterruptedSessions.execute()).toBe(1);
    expect((await useCases.getSession.execute(session.id)).status).toBe('failed');
  });
});

describe('modo "Sugeridos": agentes automáticos al terminar de grabar', () => {
  const specialist = (summary: string): SpecialistReport => ({
    summary,
    criteria: [],
    observations: [],
    approvalPercentage: 100,
  });
  const lead: LeadReport = { summary: 'Todo en orden.', verdicts: [], observations: [] };

  it('lanza el equipo de agentes solo al completar la sesión', async () => {
    const model = new FakeAgentModel({
      api: specialist('api'),
      frontend: specialist('frontend'),
      sec: specialist('sec'),
      a11y: specialist('a11y'),
      perf: specialist('perf'),
      rt: specialist('rt'),
      func: specialist('func'),
      env: specialist('env'),
      ux: specialist('ux'),
      reg: specialist('reg'),
      lead,
    });
    const deps = createTestDeps();
    deps.agentModel = model;
    const useCases = createUseCases(deps);
    const session = await useCases.createSession.execute(sampleInput({ analysisMode: 'suggested' }));

    await useCases.startRecording.execute(session.id);
    await useCases.stopRecording.execute(session.id);
    await useCases.startAgentRun.settled(session.id);

    const [run] = await useCases.listAgentRuns.execute(session.id);
    expect(run?.status).toBe('completed');
  });

  it('sin agentes configurados, terminar de grabar en modo "Sugeridos" no falla ni intenta nada', async () => {
    const deps = createTestDeps();
    const useCases = createUseCases(deps);
    const session = await useCases.createSession.execute(sampleInput({ analysisMode: 'suggested' }));
    await useCases.startRecording.execute(session.id);
    await expect(useCases.stopRecording.execute(session.id)).resolves.toMatchObject({ status: 'completed' });
  });

  it('"Elegir yo" también arranca solo al completar, con solo el agente elegido', async () => {
    const model = new FakeAgentModel({ api: specialist('api'), lead });
    const deps = createTestDeps();
    deps.agentModel = model;
    const useCases = createUseCases(deps);
    const session = await useCases.createSession.execute(
      sampleInput({ analysisMode: 'manual', selectedAgents: ['api'] }),
    );

    await useCases.startRecording.execute(session.id);
    await useCases.stopRecording.execute(session.id);
    await useCases.startAgentRun.settled(session.id);

    const [run] = await useCases.listAgentRuns.execute(session.id);
    expect(run?.status).toBe('completed');
    expect(run?.steps.map((step) => step.agentId)).toEqual(['api', 'lead']);
  });
});
