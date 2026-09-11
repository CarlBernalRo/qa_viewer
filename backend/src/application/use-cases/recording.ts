import type { SessionDto } from '@rastro/shared';
import { DomainError, InvalidStateError, NotFoundError } from '../../domain/errors.js';
import type { BrowserRecorder } from '../../domain/ports.js';
import { Redactor } from '../../domain/redaction/Redactor.js';
import { ActiveRecording, type RecordingDeps } from '../recording/ActiveRecording.js';

export class StartRecording {
  constructor(
    private readonly recorder: BrowserRecorder,
    private readonly deps: RecordingDeps,
  ) {}

  async execute(sessionId: string): Promise<SessionDto> {
    const { sessions, media, clock, notifier, registry, logger } = this.deps;
    const session = await sessions.findById(sessionId);
    if (!session) throw new NotFoundError('una sesión', sessionId);
    if (registry.has(sessionId)) throw new InvalidStateError('Esta sesión ya está grabando.');
    registry.assertCapacity();

    session.start(clock.now());
    await sessions.save(session);

    const videoDir = await media.prepareVideoDir(sessionId);
    const recording = new ActiveRecording(session, new Redactor(session.capture.redaction), this.deps);
    try {
      const handle = await this.recorder.start(
        { sessionId, config: session.capture, videoDir },
        recording,
      );
      if (!recording.isEnded) registry.add(sessionId, { handle, done: recording.done });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      logger.error('No se pudo iniciar el navegador', { sessionId, reason });
      session.fail(clock.now(), `No se pudo abrir el navegador: ${reason}`);
      await sessions.save(session);
      notifier.publish({ type: 'session-status', sessionId, status: 'failed', failureReason: reason });
      throw new DomainError('RECORDER_FAILED', `No se pudo abrir el navegador: ${reason}`);
    }

    notifier.publish({ type: 'session-status', sessionId, status: 'recording' });
    return session.toDto();
  }
}

export class StopRecording {
  constructor(private readonly deps: RecordingDeps) {}

  async execute(sessionId: string): Promise<SessionDto> {
    const entry = this.deps.registry.get(sessionId);
    if (!entry) throw new InvalidStateError('La sesión no está grabando.');
    await entry.handle.stop();
    await entry.done;
    const session = await this.deps.sessions.findById(sessionId);
    if (!session) throw new NotFoundError('una sesión', sessionId);
    return session.toDto();
  }
}
