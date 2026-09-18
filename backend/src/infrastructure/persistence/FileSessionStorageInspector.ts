import type { SessionStorageInspector } from '../../domain/ports.js';
import { folderSize } from './fs-utils.js';
import type { SessionPaths } from './SessionPaths.js';

/** Suma el tamaño de todo lo que hay en la carpeta de la sesión (video, eventos, agentes…). */
export class FileSessionStorageInspector implements SessionStorageInspector {
  constructor(private readonly paths: SessionPaths) {}

  async sizeBytes(sessionId: string): Promise<number> {
    return folderSize(this.paths.dir(sessionId));
  }
}
