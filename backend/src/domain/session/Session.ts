import {
  EMPTY_STATS,
  type CaptureConfig,
  type CaptureEvent,
  type Objective,
  type SessionDto,
  type SessionStats,
  type SessionStatus,
} from '@rastro/shared';
import { DomainError, InvalidStateError } from '../errors.js';
import { applyEventToStats } from './stats.js';

interface SessionProps {
  id: string;
  createdAt: Date;
  startedAt?: Date;
  endedAt?: Date;
  status: SessionStatus;
  failureReason?: string;
  objective: Objective;
  capture: CaptureConfig;
  stats: SessionStats;
  hasVideo: boolean;
  videoOffsetMs?: number;
  baselineSessionId?: string;
}

/**
 * Sesión de QA: un objetivo, una configuración de captura y su ciclo de vida
 * draft → recording → completed | failed.
 */
export class Session {
  private constructor(private props: SessionProps) {}

  static create(params: {
    id: string;
    now: Date;
    objective: Objective;
    capture: CaptureConfig;
  }): Session {
    const ids = params.objective.criteria.map((criterion) => criterion.id);
    if (new Set(ids).size !== ids.length) {
      throw new DomainError('INVALID_OBJECTIVE', 'Cada criterio de aceptación debe tener un id distinto.');
    }
    return new Session({
      id: params.id,
      createdAt: params.now,
      status: 'draft',
      objective: params.objective,
      capture: params.capture,
      stats: { ...EMPTY_STATS },
      hasVideo: false,
    });
  }

  static fromDto(dto: SessionDto): Session {
    const { createdAt, startedAt, endedAt, ...rest } = dto;
    return new Session({
      ...rest,
      createdAt: new Date(createdAt),
      ...(startedAt ? { startedAt: new Date(startedAt) } : {}),
      ...(endedAt ? { endedAt: new Date(endedAt) } : {}),
    });
  }

  get id(): string {
    return this.props.id;
  }

  get status(): SessionStatus {
    return this.props.status;
  }

  get objective(): Objective {
    return this.props.objective;
  }

  get capture(): CaptureConfig {
    return this.props.capture;
  }

  get baselineSessionId(): string | undefined {
    return this.props.baselineSessionId;
  }

  /** `undefined` quita la comparación. */
  setBaseline(sessionId: string | undefined): void {
    this.props.baselineSessionId = sessionId;
  }

  get stats(): SessionStats {
    return this.props.stats;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  /** Instante de inicio de la grabación: el cero de la línea de tiempo. */
  get startedAtMs(): number | undefined {
    return this.props.startedAt?.getTime();
  }

  /** Registra cuándo empezó el video respecto del inicio de la sesión (solo la primera vez). */
  markVideoStart(now: Date): void {
    if (this.props.status !== 'recording' || this.props.videoOffsetMs !== undefined) return;
    const startedAt = this.props.startedAt?.getTime() ?? now.getTime();
    this.props.videoOffsetMs = Math.max(0, now.getTime() - startedAt);
  }

  start(now: Date): void {
    if (this.props.status !== 'draft') {
      throw new InvalidStateError(`La sesión ya está en estado "${this.props.status}" y no puede grabarse de nuevo.`);
    }
    this.props.status = 'recording';
    this.props.startedAt = now;
  }

  recordEvent(event: CaptureEvent): void {
    if (this.props.status !== 'recording') {
      throw new InvalidStateError('Solo se registran eventos mientras la sesión está grabando.');
    }
    this.props.stats = applyEventToStats(this.props.stats, event);
  }

  complete(now: Date, result: { hasVideo: boolean }): void {
    if (this.props.status !== 'recording') {
      throw new InvalidStateError('Solo se puede completar una sesión que está grabando.');
    }
    this.props.status = 'completed';
    this.props.endedAt = now;
    this.props.hasVideo = result.hasVideo;
  }

  fail(now: Date, reason: string): void {
    if (this.props.status === 'completed' || this.props.status === 'failed') {
      throw new InvalidStateError('La sesión ya terminó.');
    }
    this.props.status = 'failed';
    this.props.endedAt = now;
    this.props.failureReason = reason;
  }

  elapsedMs(now: Date): number {
    if (!this.props.startedAt) return 0;
    const end = this.props.endedAt ?? now;
    return Math.max(0, end.getTime() - this.props.startedAt.getTime());
  }

  toDto(): SessionDto {
    const { createdAt, startedAt, endedAt, ...rest } = this.props;
    return {
      ...rest,
      createdAt: createdAt.toISOString(),
      ...(startedAt ? { startedAt: startedAt.toISOString() } : {}),
      ...(endedAt ? { endedAt: endedAt.toISOString() } : {}),
    };
  }
}
