import { readFile } from 'node:fs/promises';
import { emptyReview, sessionReviewSchema, type SessionReview } from '@rastro/shared';
import type { SessionReviewStore } from '../../domain/ports.js';
import { isNotFound, writeFileAtomic } from './fs-utils.js';
import type { SessionPaths } from './SessionPaths.js';

/** Guarda la revisión del QA en `review.json` dentro de la carpeta de la sesión. */
export class FileSessionReviewStore implements SessionReviewStore {
  /** Serializa los cambios por sesión: dos marcas seguidas no se pisan. */
  private readonly writes = new Map<string, Promise<unknown>>();

  constructor(private readonly paths: SessionPaths) {}

  async read(sessionId: string): Promise<SessionReview> {
    try {
      const raw = await readFile(this.paths.reviewFile(sessionId), 'utf8');
      return sessionReviewSchema.parse(JSON.parse(raw));
    } catch (error) {
      if (isNotFound(error)) return emptyReview();
      throw error;
    }
  }

  async update(sessionId: string, change: (review: SessionReview) => SessionReview): Promise<SessionReview> {
    const previous = this.writes.get(sessionId) ?? Promise.resolve();
    const next = previous
      .catch(() => undefined)
      .then(async () => {
        const updated = change(await this.read(sessionId));
        await writeFileAtomic(this.paths.reviewFile(sessionId), `${JSON.stringify(updated, null, 2)}\n`);
        return updated;
      });
    this.writes.set(sessionId, next);
    try {
      return await next;
    } finally {
      if (this.writes.get(sessionId) === next) this.writes.delete(sessionId);
    }
  }
}
