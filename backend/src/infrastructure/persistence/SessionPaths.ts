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

  agentsFile(id: string): string {
    return join(this.dir(id), 'agents.json');
  }

  /** El id de la corrida llega en la URL al reintentar: se valida antes de armar la ruta. */
  agentCheckpointFile(id: string, runId: string): string {
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(runId)) throw new NotFoundError('un análisis de agentes', runId);
    return join(this.dir(id), 'agent-checkpoints', `${runId}.json`);
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

  screenshotsDir(id: string): string {
    return join(this.dir(id), 'screenshots');
  }

  /** `file` ya viene validado por el llamador (nombre simple, sin separadores). */
  screenshotFile(id: string, file: string): string {
    return join(this.screenshotsDir(id), file);
  }
}
