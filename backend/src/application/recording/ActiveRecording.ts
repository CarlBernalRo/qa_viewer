import type { CaptureEvent, RawCaptureEvent } from '@rastro/shared';
import type { Redactor } from '../../domain/redaction/Redactor.js';
import type { Session } from '../../domain/session/Session.js';
import type {
  Clock,
  EventStore,
  IdGenerator,
  LiveNotifier,
  Logger,
  MediaStore,
  RecordingResult,
  RecordingSink,
  SessionRepository,
} from '../../domain/ports.js';
import type { RecordingRegistry } from './RecordingRegistry.js';

export interface RecordingDeps {
  sessions: SessionRepository;
  events: EventStore;
  media: MediaStore;
  clock: Clock;
  ids: IdGenerator;
  notifier: LiveNotifier;
  logger: Logger;
  registry: RecordingRegistry;
}

const STATS_INTERVAL_MS = 500;

/**
 * Recibe los eventos crudos del grabador, los oculta, los registra en la sesión
 * y cierra la sesión cuando la grabación termina.
 */
export class ActiveRecording implements RecordingSink {
  readonly done: Promise<void>;
  private resolveDone!: () => void;
  private ended = false;
  private lastStatsAt = 0;
  private readonly startedAtMs: number;

  constructor(
    private readonly session: Session,
    private readonly redactor: Redactor,
    private readonly deps: RecordingDeps,
  ) {
    // El cero de la línea de tiempo es el inicio de la sesión, igual que el del video.
    this.startedAtMs = session.startedAtMs ?? deps.clock.now().getTime();
    this.done = new Promise((resolve) => {
      this.resolveDone = resolve;
    });
  }

  get isEnded(): boolean {
    return this.ended;
  }

  onEvent(raw: RawCaptureEvent): void {
    if (this.ended) return;
    const nowMs = this.deps.clock.now().getTime();
    const event = {
      ...this.redactor.redactEvent(raw),
      id: this.deps.ids.eventId(),
      t: Math.max(0, nowMs - this.startedAtMs),
    } as CaptureEvent;
    this.session.recordEvent(event);
    this.deps.events.append(this.session.id, event);
    if (nowMs - this.lastStatsAt >= STATS_INTERVAL_MS) {
      this.lastStatsAt = nowMs;
      this.publishStats();
    }
  }

  onVideoStarted(): void {
    if (!this.ended) this.session.markVideoStart(this.deps.clock.now());
  }

  onEnded(result: RecordingResult): void {
    if (this.ended) return;
    this.ended = true;
    void this.finalize(result).finally(() => this.resolveDone());
  }

  private async finalize(result: RecordingResult): Promise<void> {
    const { sessions, events, media, clock, notifier, logger, registry } = this.deps;
    const id = this.session.id;
    registry.remove(id);
    try {
      await events.flush(id);
      // Sin video la sesión sigue siendo útil (eventos y línea de tiempo): no se descarta.
      let hasVideo = false;
      try {
        hasVideo = await media.importVideo(id, result.videoFile);
      } catch (error) {
        logger.warn('La sesión se guardó sin video', { sessionId: id, error: String(error) });
      }
      if (result.reason === 'crashed') {
        this.session.fail(clock.now(), result.error ?? 'El navegador se cerró de forma inesperada.');
      } else {
        this.session.complete(clock.now(), { hasVideo });
      }
      await sessions.save(this.session);
      logger.info('Grabación finalizada', { sessionId: id, reason: result.reason, hasVideo });
    } catch (error) {
      logger.error('No se pudo finalizar la grabación', { sessionId: id, error: String(error) });
      if (this.session.status === 'recording') {
        this.session.fail(clock.now(), 'No se pudo guardar el final de la grabación.');
        await sessions.save(this.session).catch(() => undefined);
      }
    }
    this.publishStats();
    const dto = this.session.toDto();
    notifier.publish({
      type: 'session-status',
      sessionId: id,
      status: dto.status,
      ...(dto.failureReason ? { failureReason: dto.failureReason } : {}),
    });
  }

  private publishStats(): void {
    this.deps.notifier.publish({
      type: 'session-stats',
      sessionId: this.session.id,
      elapsedMs: this.session.elapsedMs(this.deps.clock.now()),
      stats: this.session.stats,
    });
  }
}
