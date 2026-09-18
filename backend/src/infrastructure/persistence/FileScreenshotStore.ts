import { mkdir, readFile } from 'node:fs/promises';
import type { ScreenshotStore } from '../../domain/ports.js';
import { isNotFound } from './fs-utils.js';
import type { SessionPaths } from './SessionPaths.js';

/** Nombres de archivo válidos: los arma el propio grabador, nunca vienen de fuera. */
const SAFE_FILE = /^[\w.-]+$/;

export class FileScreenshotStore implements ScreenshotStore {
  constructor(private readonly paths: SessionPaths) {}

  async prepareDir(sessionId: string): Promise<string> {
    const dir = this.paths.screenshotsDir(sessionId);
    await mkdir(dir, { recursive: true });
    return dir;
  }

  async read(sessionId: string, file: string): Promise<Buffer | null> {
    if (!SAFE_FILE.test(file)) return null;
    try {
      return await readFile(this.paths.screenshotFile(sessionId, file));
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }
}
