import type { CreateSessionInput, CaptureEvent, SessionDto } from '@rastro/shared';
import { DomainError, InvalidStateError, NotFoundError } from '../../domain/errors.js';
import type { Clock, EventQuery, EventStore, IdGenerator, MediaStore, SessionRepository } from '../../domain/ports.js';
import { Session } from '../../domain/session/Session.js';

export class CreateSession {
  constructor(
    private readonly sessions: SessionRepository,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  async execute(input: CreateSessionInput): Promise<SessionDto> {
    if (input.capture.analysisMode === 'manual' && !input.capture.selectedAgents?.length) {
      throw new DomainError('INVALID_CAPTURE', 'En "Elegir yo" hay que elegir al menos un agente.');
    }
    const session = Session.create({
      id: this.ids.sessionId(),
      now: this.clock.now(),
      objective: input.objective,
      capture: input.capture,
    });
    await this.sessions.save(session);
    return session.toDto();
  }
}

export class ListSessions {
  constructor(private readonly sessions: SessionRepository) {}

  async execute(): Promise<SessionDto[]> {
    const all = await this.sessions.list();
    return all
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map((session) => session.toDto());
  }
}

export class GetSession {
  constructor(private readonly sessions: SessionRepository) {}

  async execute(id: string): Promise<SessionDto> {
    const session = await this.sessions.findById(id);
    if (!session) throw new NotFoundError('una sesión', id);
    return session.toDto();
  }
}

export class GetSessionEvents {
  constructor(
    private readonly sessions: SessionRepository,
    private readonly events: EventStore,
  ) {}

  async execute(id: string, query: EventQuery = {}): Promise<CaptureEvent[]> {
    const session = await this.sessions.findById(id);
    if (!session) throw new NotFoundError('una sesión', id);
    return this.events.read(id, query);
  }
}

export class GetSessionVideo {
  constructor(
    private readonly sessions: SessionRepository,
    private readonly media: MediaStore,
  ) {}

  async execute(id: string): Promise<string> {
    const session = await this.sessions.findById(id);
    if (!session) throw new NotFoundError('una sesión', id);
    const path = await this.media.videoPath(id);
    if (!path) throw new NotFoundError('un video para la sesión', id);
    return path;
  }
}

export class DeleteSession {
  constructor(
    private readonly sessions: SessionRepository,
    private readonly isRecording: (id: string) => boolean,
  ) {}

  async execute(id: string): Promise<void> {
    const session = await this.sessions.findById(id);
    if (!session) throw new NotFoundError('una sesión', id);
    if (session.status === 'recording' || this.isRecording(id)) {
      throw new InvalidStateError('Detén la grabación antes de eliminar la sesión.');
    }
    await this.sessions.delete(id);
  }
}

/** Al arrancar: las sesiones que quedaron "grabando" por un cierre inesperado pasan a fallidas. */
export class RecoverInterruptedSessions {
  constructor(
    private readonly sessions: SessionRepository,
    private readonly clock: Clock,
  ) {}

  async execute(): Promise<number> {
    const interrupted = (await this.sessions.list()).filter((s) => s.status === 'recording');
    for (const session of interrupted) {
      session.fail(this.clock.now(), 'La aplicación se cerró mientras la sesión grababa.');
      await this.sessions.save(session);
    }
    return interrupted.length;
  }
}
