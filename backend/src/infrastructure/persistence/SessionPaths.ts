import { join } from 'node:path';
import { NotFoundError } from '../../domain/errors.js';
import { SESSION_ID_PATTERN } from '../system/system.js';

/**
 * Rutas en disco de cada sesión. Valida el id antes de construir cualquier ruta,
 * así un id manipulado nunca puede salir de la carpeta de datos.
 */
export class SessionPaths {
  readonly sessionsDir: string;

  constructor(dataDir: string) {
    this.sessionsDir = join(dataDir, 'sessions');
  }

  static isValidId(id: string): boolean {
    return SESSION_ID_PATTERN.test(id);
  }

  dir(id: string): string {
    if (!SessionPaths.isValidId(id)) throw new NotFoundError('una sesión', id);
    return join(this.sessionsDir, id);
  }

  sessionFile(id: string): string {
    return join(this.dir(id), 'session.json');
  }

  eventsFile(id: string): string {
    return join(this.dir(id), 'events.ndjson');
  }

  reviewFile(id: string): string {
    return join(this.dir(id), 'review.json');
  }

  findingDecisionsFile(id: string): string {
    return join(this.dir(id), 'findings-decisions.json');
  }

  videoFile(id: string): string {
    return join(this.dir(id), 'video.webm');
  }

  videoTmpDir(id: string): string {
    return join(this.dir(id), '.video-tmp');
  }
}
