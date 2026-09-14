import { access, mkdir, rename, rm } from 'node:fs/promises';
import type { MediaStore } from '../../domain/ports.js';
import { isNotFound, retryWhileBusy } from './fs-utils.js';
import type { SessionPaths } from './SessionPaths.js';

export class FileMediaStore implements MediaStore {
  constructor(private readonly paths: SessionPaths) {}

  async prepareVideoDir(sessionId: string): Promise<string> {
    const dir = this.paths.videoTmpDir(sessionId);
    await mkdir(dir, { recursive: true });
    return dir;
  }

  async importVideo(sessionId: string, sourcePath: string | undefined): Promise<boolean> {
    let imported = false;
    if (sourcePath) {
      try {
        await retryWhileBusy(() => rename(sourcePath, this.paths.videoFile(sessionId)));
        imported = true;
      } catch (error) {
        if (!isNotFound(error)) throw error;
      }
    }
    // Si algún archivo temporal sigue bloqueado, se deja: no vale la pena fallar por eso.
    await rm(this.paths.videoTmpDir(sessionId), { recursive: true, force: true }).catch(() => undefined);
    return imported;
  }

  async videoPath(sessionId: string): Promise<string | null> {
    const file = this.paths.videoFile(sessionId);
    try {
      await access(file);
      return file;
    } catch {
      return null;
    }
  }
}
