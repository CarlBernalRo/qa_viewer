import { readdir, readFile, rm } from 'node:fs/promises';
import { sessionSchema } from '@rastro/shared';
import type { Logger, SessionRepository } from '../../domain/ports.js';
import { Session } from '../../domain/session/Session.js';
import { isNotFound, retryWhileBusy, writeFileAtomic } from './fs-utils.js';
import { SessionPaths } from './SessionPaths.js';

export class FileSessionRepository implements SessionRepository {
  /** Serializa las escrituras por sesión para que dos guardados no se crucen. */
  private readonly writes = new Map<string, Promise<void>>();

  constructor(
    private readonly paths: SessionPaths,
    private readonly logger: Logger,
  ) {}

  async save(session: Session): Promise<void> {
    const file = this.paths.sessionFile(session.id);
    const content = `${JSON.stringify(session.toDto(), null, 2)}\n`;
    const previous = this.writes.get(session.id) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(() => writeFileAtomic(file, content));
    this.writes.set(session.id, next);
    try {
      await next;
    } finally {
      if (this.writes.get(session.id) === next) this.writes.delete(session.id);
    }
  }

  async findById(id: string): Promise<Session | null> {
    if (!SessionPaths.isValidId(id)) return null;
    try {
      const raw = await readFile(this.paths.sessionFile(id), 'utf8');
      return Session.fromDto(sessionSchema.parse(JSON.parse(raw)));
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  async delete(id: string): Promise<void> {
    if (!SessionPaths.isValidId(id)) return;
    const dir = this.paths.dir(id);
    await retryWhileBusy(() => rm(dir, { recursive: true, force: true }));
  }

  async list(): Promise<Session[]> {
    let entries: string[];
    try {
      entries = await readdir(this.paths.sessionsDir);
    } catch (error) {
      if (isNotFound(error)) return [];
      throw error;
    }
    const sessions: Session[] = [];
    for (const id of entries.filter((entry) => SessionPaths.isValidId(entry))) {
      try {
        const session = await this.findById(id);
        if (session) sessions.push(session);
      } catch (error) {
        this.logger.warn('Se omitió una sesión ilegible', { sessionId: id, error: String(error) });
      }
    }
    return sessions;
  }
}
