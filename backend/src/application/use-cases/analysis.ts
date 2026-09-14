import type { FindingDecisionRecord, FindingDecisionValue, SessionAnalysis } from '@rastro/shared';
import { analyzeSession } from '../../domain/analysis/analyzeSession.js';
import { InvalidStateError, NotFoundError } from '../../domain/errors.js';
import type { Clock, EventStore, FindingDecisionStore, SessionRepository } from '../../domain/ports.js';

/** Corre las reglas fijas sobre lo grabado y les aplica las decisiones que ya tomó el QA. */
export class AnalyzeSession {
  constructor(
    private readonly sessions: SessionRepository,
    private readonly events: EventStore,
    private readonly decisions: FindingDecisionStore,
    private readonly clock: Clock,
  ) {}

  async execute(id: string): Promise<SessionAnalysis> {
    const session = await this.sessions.findById(id);
    if (!session) throw new NotFoundError('una sesión', id);
    if (session.status === 'draft') {
      throw new InvalidStateError('La sesión todavía no se grabó: no hay nada que analizar.');
    }
    const [events, decisions] = await Promise.all([this.events.read(id), this.decisions.read(id)]);
    const analysis = analyzeSession({
      sessionId: id,
      now: this.clock.now(),
      objective: session.objective,
      capture: session.capture,
      events,
    });
    if (Object.keys(decisions).length === 0) return analysis;
    return {
      ...analysis,
      findings: analysis.findings.map((finding) => {
        const decision = decisions[finding.id];
        return decision ? { ...finding, decision } : finding;
      }),
    };
  }
}

/** Confirma, descarta o limpia la decisión sobre un hallazgo concreto. */
export class SetFindingDecision {
  constructor(
    private readonly analyze: AnalyzeSession,
    private readonly decisions: FindingDecisionStore,
    private readonly clock: Clock,
  ) {}

  async execute(
    sessionId: string,
    findingId: string,
    input: { decision: FindingDecisionValue | null; note?: string },
  ): Promise<SessionAnalysis> {
    // Recalcula sin decisiones propias solo para confirmar que el hallazgo existe en esta sesión.
    const current = await this.analyze.execute(sessionId);
    if (!current.findings.some((finding) => finding.id === findingId)) {
      throw new NotFoundError('un hallazgo', findingId);
    }
    const record: FindingDecisionRecord | null = input.decision
      ? { decision: input.decision, decidedAt: this.clock.now().toISOString(), ...(input.note ? { note: input.note } : {}) }
      : null;
    await this.decisions.set(sessionId, findingId, record);
    return this.analyze.execute(sessionId);
  }
}
