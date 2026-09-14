import { readFile } from 'node:fs/promises';
import type { FindingDecisionRecord } from '@rastro/shared';
import type { FindingDecisionStore } from '../../domain/ports.js';
import { isNotFound, writeFileAtomic } from './fs-utils.js';
import type { SessionPaths } from './SessionPaths.js';

type Decisions = Record<string, FindingDecisionRecord>;

/**
 * Guarda las decisiones del QA sobre los hallazgos en un archivo por sesión.
 * Los hallazgos en sí no se guardan (se recalculan en cada pedido): solo esto.
 */
export class FileFindingDecisionStore implements FindingDecisionStore {
  /** Serializa las escrituras por sesión para que dos decisiones seguidas no se pisen. */
  private readonly writes = new Map<string, Promise<void>>();

  constructor(private readonly paths: SessionPaths) {}

  async read(sessionId: string): Promise<Decisions> {
    try {
      const raw = await readFile(this.paths.findingDecisionsFile(sessionId), 'utf8');
      return JSON.parse(raw) as Decisions;
    } catch (error) {
      if (isNotFound(error)) return {};
      throw error;
    }
  }

  async set(sessionId: string, findingId: string, record: FindingDecisionRecord | null): Promise<void> {
    const previous = this.writes.get(sessionId) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(async () => {
      const decisions = await this.read(sessionId);
      if (record) decisions[findingId] = record;
      else delete decisions[findingId];
      await writeFileAtomic(this.paths.findingDecisionsFile(sessionId), `${JSON.stringify(decisions, null, 2)}\n`);
    });
    this.writes.set(sessionId, next);
    try {
      await next;
    } finally {
      if (this.writes.get(sessionId) === next) this.writes.delete(sessionId);
    }
  }
}
