import {
  leadReportSchema,
  specialistReportSchema,
  SPECIALIST_AGENTS,
  type AgentId,
  type AgentRun,
  type AgentStatus,
  type AgentStep,
  type CaptureEvent,
  type SessionDto,
  type SpecialistId,
  type SpecialistReport,
} from '@rastro/shared';
import { FeatureNotAvailableError, InvalidStateError, NotFoundError } from '../../domain/errors.js';
import type {
  AgentCheckpoint,
  AgentModel,
  AgentModelImage,
  AgentModelUsage,
  AgentRunStore,
  AgentSettingsStore,
  Clock,
  EventStore,
  IdGenerator,
  Logger,
  ScreenshotStore,
  SessionRepository,
  SessionReviewStore,
} from '../../domain/ports.js';
import type { Session } from '../../domain/session/Session.js';
import {
  a11yDigest,
  apiDigest,
  envDigest,
  EvidenceRefs,
  frontendDigest,
  funcDigest,
  perfDigest,
  realtimeDigest,
  regDigest,
  securityDigest,
  sharedBrief,
  uxDigest,
} from '../agents/brief.js';
import { AGENT_SYSTEM, leadTask, specialistTask } from '../agents/prompts.js';
import type { AnalyzeSession } from './analysis.js';

export const AGENTS_NOT_CONFIGURED =
  'Los agentes no están configurados: define GEMINI_API_KEY (o OPENROUTER_API_KEY) en backend/.env y reinicia Rastro.';

export class GetAgentStatus {
  constructor(
    private readonly model: AgentModel | null,
    private readonly modelName: string,
    private readonly providerName: string,
  ) {}

  execute(): AgentStatus {
    return this.model
      ? { available: true, provider: this.model.provider, model: this.model.model }
      : { available: false, provider: this.providerName, model: this.modelName, reason: AGENTS_NOT_CONFIGURED };
  }
}

/** Especialistas de la corrida: los que eligió el QA ("Elegir yo"), o el equipo completo por defecto. */
function specialistsFor(session: Session): readonly SpecialistId[] {
  const selected = session.capture.selectedAgents;
  return selected && selected.length > 0 ? selected : SPECIALIST_AGENTS;
}

function addUsage(total: AgentModelUsage, usage: AgentModelUsage): void {
  total.inputTokens += usage.inputTokens;
  total.outputTokens += usage.outputTokens;
  total.cacheReadTokens += usage.cacheReadTokens;
  total.cacheWriteTokens += usage.cacheWriteTokens;
}

/**
 * Lanza el equipo de agentes sobre una sesión grabada. Responde enseguida con la corrida
 * "en curso"; los agentes trabajan en segundo plano y cada paso se guarda al terminar.
 * Un análisis que falla se puede retomar: los agentes que ya respondieron no se vuelven a consultar.
 */
export class StartAgentRun {
  private readonly active = new Map<string, Promise<void>>();
  /** Sesiones con un análisis a punto de arrancar (evita que dos pedidos seguidos arranquen dos). */
  private readonly reserved = new Set<string>();

  constructor(
    private readonly sessions: SessionRepository,
    private readonly events: EventStore,
    private readonly analyze: AnalyzeSession,
    private readonly reviews: SessionReviewStore,
    private readonly runs: AgentRunStore,
    private readonly agentSettings: AgentSettingsStore,
    private readonly screenshots: ScreenshotStore,
    private readonly model: AgentModel | null,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly logger: Logger,
  ) {}

  isRunning(sessionId: string): boolean {
    return this.active.has(sessionId) || this.reserved.has(sessionId);
  }

  /** Espera a que termine la corrida en curso de la sesión (tests y apagado). */
  async settled(sessionId: string): Promise<void> {
    await this.active.get(sessionId);
  }

  /** Análisis nuevo: arma el contexto y consulta a los tres agentes. `note`: recomendación puntual del QA para esta corrida. */
  async execute(sessionId: string, note?: string, agentId?: SpecialistId): Promise<AgentRun> {
    const { model, session } = await this.reserve(sessionId);
    try {
      return await this.start(model, session, note, agentId);
    } finally {
      this.reserved.delete(sessionId);
    }
  }

  /** Retoma un análisis fallido o interrumpido desde el agente que falta. */
  async retry(sessionId: string, runId: string): Promise<AgentRun> {
    const { model, session } = await this.reserve(sessionId);
    try {
      const run = (await this.runs.list(sessionId)).find((item) => item.id === runId);
      if (!run) throw new NotFoundError('un análisis de agentes', runId);
      if (run.status === 'completed') {
        throw new InvalidStateError('Ese análisis ya terminó: usa "Volver a analizar" para hacer uno nuevo.');
      }
      const checkpoint = await this.runs.loadCheckpoint(sessionId, runId);
      // Sin punto de control (análisis de una versión anterior) no hay de dónde retomar: se empieza de nuevo.
      if (!checkpoint) {
        // Al retomar desde cero, usamos los especialistas que estaban previstos en ese run.
        const prevAgentId = run.steps.length === 2 ? (run.steps[0]?.agentId as SpecialistId | undefined) : undefined;
        return await this.start(model, session, undefined, prevAgentId);
      }

      run.status = 'running';
      run.model = model.model;
      delete run.error;
      delete run.finishedAt;
      for (const step of run.steps) {
        if (step.status !== 'done') {
          step.status = 'pending';
          delete step.error;
        }
      }
      await this.runs.save(run);
      return this.launch(model, session, run, checkpoint);
    } finally {
      this.reserved.delete(sessionId);
    }
  }

  private async reserve(sessionId: string): Promise<{ model: AgentModel; session: Session }> {
    const model = this.model;
    if (!model) throw new FeatureNotAvailableError(AGENTS_NOT_CONFIGURED);
    const session = await this.sessions.findById(sessionId);
    if (!session) throw new NotFoundError('una sesión', sessionId);
    if (session.status === 'draft' || session.status === 'recording') {
      throw new InvalidStateError('Los agentes revisan sesiones que ya terminaron de grabarse.');
    }
    if (this.isRunning(sessionId)) throw new InvalidStateError('Ya hay un análisis de agentes en curso para esta sesión.');
    this.reserved.add(sessionId);
    return { model, session };
  }

  private async start(model: AgentModel, session: Session, note?: string, agentId?: SpecialistId): Promise<AgentRun> {
    const specialists = agentId ? [agentId] : specialistsFor(session);
    const order: readonly AgentId[] = [...specialists, 'lead'];
    const run: AgentRun = {
      id: this.ids.eventId(),
      sessionId: session.id,
      status: 'running',
      model: model.model,
      startedAt: this.clock.now().toISOString(),
      steps: order.map((agentId): AgentStep => ({ agentId, status: 'pending' })),
      proposals: [],
      findings: [],
      usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
    };
    await this.runs.save(run);
    return this.launch(model, session, run, null, note);
  }

  private launch(
    model: AgentModel,
    session: Session,
    run: AgentRun,
    checkpoint: AgentCheckpoint | null,
    note?: string,
  ): AgentRun {
    const work = this.process(model, session, run, checkpoint, note)
      .catch(async (error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn('El análisis de agentes falló', { sessionId: session.id, runId: run.id, error: message });
        run.status = 'failed';
        run.error = message;
        run.finishedAt = this.clock.now().toISOString();
        for (const step of run.steps) {
          if (step.status === 'running') {
            step.status = 'failed';
            step.error = message;
          }
        }
        await this.runs.save(run).catch(() => undefined);
      })
      .finally(() => this.active.delete(session.id));
    this.active.set(session.id, work);
    return structuredClone(run);
  }

  private async setStep(run: AgentRun, agentId: AgentId, change: Partial<AgentStep>): Promise<void> {
    const step = run.steps.find((item) => item.agentId === agentId);
    if (step) Object.assign(step, change);
    await this.runs.save(run);
  }

  /** Lo que reciben los agentes. Se arma una vez y se guarda: al retomar se usa el mismo (con la misma recomendación, si hubo). */
  private async buildContext(session: Session, note?: string): Promise<AgentCheckpoint> {
    const [events, review, analysis, baseline] = await Promise.all([
      this.events.read(session.id),
      this.reviews.read(session.id),
      this.analyze.execute(session.id),
      this.loadBaseline(session.baselineSessionId),
    ]);
    const dto = session.toDto();
    const refs = new EvidenceRefs();
    // El resumen se arma primero y es idéntico para todos los agentes: así se reutiliza en caché.
    const brief = sharedBrief({ session: dto, review, analysis, events, ...(note ? { note } : {}) }, refs);
    const digests = {
      api: apiDigest(dto, events, refs),
      frontend: frontendDigest(events, refs),
      sec: securityDigest(dto, events, refs),
      a11y: a11yDigest(events, refs),
      perf: perfDigest(events, refs),
      rt: realtimeDigest(dto, events, refs),
      func: funcDigest(events, refs),
      env: envDigest(dto, events, refs),
      ux: uxDigest(events, refs),
      reg: regDigest({ session: dto, events }, baseline, refs),
    };
    return { brief, digests, refs: refs.entries(), reports: {} };
  }

  /** null si no hay sesión base configurada, o si ya no existe (se borró desde entonces). */
  private async loadBaseline(baselineSessionId?: string): Promise<{ session: SessionDto; events: readonly CaptureEvent[] } | null> {
    if (!baselineSessionId) return null;
    const baseline = await this.sessions.findById(baselineSessionId);
    if (!baseline) return null;
    const events = await this.events.read(baselineSessionId);
    return { session: baseline.toDto(), events };
  }

  /** Imágenes para el agente UI/UX: una por pantalla capturada, hasta un tope para no disparar el costo. */
  private async loadScreenshots(sessionId: string, events: readonly CaptureEvent[]): Promise<AgentModelImage[]> {
    const MAX_IMAGES = 8;
    const shots = events.filter((event) => event.kind === 'screenshot').slice(0, MAX_IMAGES);
    const images: AgentModelImage[] = [];
    for (const shot of shots) {
      const buffer = await this.screenshots.read(sessionId, shot.file);
      if (buffer) images.push({ mimeType: 'image/jpeg', data: buffer.toString('base64') });
    }
    return images;
  }

  private async process(
    model: AgentModel,
    session: Session,
    run: AgentRun,
    checkpoint: AgentCheckpoint | null,
    note?: string,
  ): Promise<void> {
    const context = checkpoint ?? (await this.buildContext(session, note));
    if (!checkpoint) await this.runs.saveCheckpoint(session.id, run.id, context);
    const refs = EvidenceRefs.fromEntries(context.refs);
    const criteria = new Set(session.objective.criteria.map((criterion) => criterion.id));

    const specialists = run.steps.map(s => s.agentId).filter(id => id !== 'lead') as SpecialistId[];
    for (const agentId of specialists) {
      // Ya respondió en un intento anterior: no se vuelve a consultar.
      if (context.reports[agentId]) continue;
      await this.setStep(run, agentId, { status: 'running' });
      const settings = await this.agentSettings.get(agentId);
      const images = agentId === 'ux' ? await this.loadScreenshots(session.id, await this.events.read(session.id)) : undefined;
      const result = await model.run({
        agentId,
        system: AGENT_SYSTEM,
        brief: context.brief,
        task: specialistTask(agentId, context.digests[agentId], settings),
        schema: specialistReportSchema,
        ...(images && images.length > 0 ? { images } : {}),
      });
      addUsage(run.usage, result.usage);
      context.reports[agentId] = result.output;
      await this.runs.saveCheckpoint(session.id, run.id, context);
      await this.setStep(run, agentId, {
        status: 'done',
        summary: result.output.summary,
        // El desglose por criterio del especialista: sin esto, su razonamiento queda comprimido en una sola frase.
        criteria: result.output.criteria
          .filter((item) => criteria.has(item.criterionId))
          .map((item) => ({ ...item, evidence: refs.resolve(item.evidence) })),
        approvalPercentage: result.output.approvalPercentage,
        finishedAt: this.clock.now().toISOString(),
      });
    }

    if (specialists.some((id) => !context.reports[id])) throw new Error('Faltan los informes de los especialistas.');
    const reports: Partial<Record<SpecialistId, SpecialistReport>> = {};
    for (const id of specialists) reports[id] = context.reports[id];
    await this.setStep(run, 'lead', { status: 'running' });
    const lead = await model.run({
      agentId: 'lead',
      system: AGENT_SYSTEM,
      brief: context.brief,
      task: leadTask(reports),
      schema: leadReportSchema,
    });
    addUsage(run.usage, lead.usage);

    run.proposals = lead.output.verdicts
      .filter((verdict) => criteria.has(verdict.criterionId))
      .map((verdict) => ({ ...verdict, evidence: refs.resolve(verdict.evidence) }));
    run.findings = lead.output.observations.map((observation, index) => {
      const agents = [...new Set(observation.agents.filter((agent) => agent !== 'lead'))];
      return {
        id: `${run.id}:${index + 1}`,
        agents: agents.length > 0 ? agents : ['lead'],
        title: observation.title,
        severity: observation.severity,
        detail: observation.detail,
        recommendation: observation.recommendation,
        criterionId: observation.criterionId && criteria.has(observation.criterionId) ? observation.criterionId : null,
        evidence: refs.resolve(observation.evidence),
      };
    });
    run.summary = lead.output.summary;
    run.status = 'completed';
    run.finishedAt = this.clock.now().toISOString();
    await this.setStep(run, 'lead', { status: 'done', summary: lead.output.summary, finishedAt: run.finishedAt });
  }
}

export class ListAgentRuns {
  constructor(
    private readonly sessions: SessionRepository,
    private readonly runs: AgentRunStore,
    private readonly isRunning: (sessionId: string) => boolean,
  ) {}

  async execute(sessionId: string): Promise<AgentRun[]> {
    const session = await this.sessions.findById(sessionId);
    if (!session) throw new NotFoundError('una sesión', sessionId);
    const runs = await this.runs.list(sessionId);
    // Una corrida "en curso" que nadie está procesando quedó cortada (p. ej., se reinició el backend).
    return runs.map((run) =>
      run.status === 'running' && !this.isRunning(sessionId)
        ? { ...run, status: 'failed', error: 'El análisis se interrumpió porque Rastro se reinició.' }
        : run,
    );
  }
}
