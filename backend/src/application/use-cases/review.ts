import type { AddMarkerInput, Marker, SessionReview, SetCriterionVerdictInput } from '@rastro/shared';
import { DomainError, InvalidStateError, NotFoundError } from '../../domain/errors.js';
import type { Clock, IdGenerator, SessionRepository, SessionReviewStore } from '../../domain/ports.js';
import type { Session } from '../../domain/session/Session.js';

async function startedSession(sessions: SessionRepository, id: string): Promise<Session> {
  const session = await sessions.findById(id);
  if (!session) throw new NotFoundError('una sesión', id);
  if (session.status === 'draft') throw new InvalidStateError('La sesión todavía no empezó a grabarse.');
  return session;
}

function assertCriterion(session: Session, criterionId: string | null | undefined): void {
  if (criterionId && !session.objective.criteria.some((criterion) => criterion.id === criterionId)) {
    throw new NotFoundError('un criterio', criterionId);
  }
}

export class GetSessionReview {
  constructor(
    private readonly sessions: SessionRepository,
    private readonly reviews: SessionReviewStore,
  ) {}

  async execute(id: string): Promise<SessionReview> {
    const session = await this.sessions.findById(id);
    if (!session) throw new NotFoundError('una sesión', id);
    return this.reviews.read(id);
  }
}

/**
 * Marca un momento como evidencia. Mientras graba, el momento es "ahora" en el reloj
 * de la sesión (el mismo de los eventos); al revisar, lo indica el reproductor.
 */
export class AddMarker {
  constructor(
    private readonly sessions: SessionRepository,
    private readonly reviews: SessionReviewStore,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  async execute(id: string, input: AddMarkerInput): Promise<SessionReview> {
    const session = await startedSession(this.sessions, id);
    const criterionId = input.criterionId ?? null;
    const note = input.note?.trim() ?? '';
    assertCriterion(session, criterionId);
    if (!criterionId && !note) {
      throw new DomainError('INVALID_MARKER', 'Una marca necesita un criterio o una nota.');
    }
    const now = this.clock.now();
    const elapsed = session.elapsedMs(now);
    const t = input.t ?? (session.status === 'recording' ? elapsed : undefined);
    if (t === undefined) throw new InvalidStateError('Indica en qué momento de la grabación va la marca.');
    const marker: Marker = {
      id: this.ids.eventId(),
      t: Math.round(Math.min(t, elapsed)),
      criterionId,
      note,
      createdAt: now.toISOString(),
    };
    return this.reviews.update(id, (review) => ({
      ...review,
      markers: [...review.markers, marker].sort((a, b) => a.t - b.t),
    }));
  }
}

export class RemoveMarker {
  constructor(
    private readonly sessions: SessionRepository,
    private readonly reviews: SessionReviewStore,
  ) {}

  async execute(id: string, markerId: string): Promise<SessionReview> {
    await startedSession(this.sessions, id);
    const current = await this.reviews.read(id);
    if (!current.markers.some((marker) => marker.id === markerId)) throw new NotFoundError('una marca', markerId);
    return this.reviews.update(id, (review) => ({
      ...review,
      markers: review.markers.filter((marker) => marker.id !== markerId),
    }));
  }
}

/** El QA decide si un criterio se cumple, falla o quedó bloqueado; `null` lo vuelve a pendiente. */
export class SetCriterionVerdict {
  constructor(
    private readonly sessions: SessionRepository,
    private readonly reviews: SessionReviewStore,
    private readonly clock: Clock,
  ) {}

  async execute(id: string, criterionId: string, input: SetCriterionVerdictInput): Promise<SessionReview> {
    const session = await startedSession(this.sessions, id);
    assertCriterion(session, criterionId);
    const updatedAt = this.clock.now().toISOString();
    return this.reviews.update(id, (review) => {
      const criteria = { ...review.criteria };
      if (input.verdict) {
        criteria[criterionId] = { verdict: input.verdict, updatedAt, ...(input.note ? { note: input.note } : {}) };
      } else {
        delete criteria[criterionId];
      }
      return { ...review, criteria };
    });
  }
}
