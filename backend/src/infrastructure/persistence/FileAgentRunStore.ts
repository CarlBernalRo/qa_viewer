import { readFile } from 'node:fs/promises';
import { agentRunListSchema, specialistReportSchema, type AgentRun } from '@rastro/shared';
import { z } from 'zod';
import type { AgentCheckpoint, AgentRunStore } from '../../domain/ports.js';
import { isNotFound, writeFileAtomic } from './fs-utils.js';
import type { SessionPaths } from './SessionPaths.js';

const checkpointSchema = z.object({
  brief: z.string(),
  digests: z.object({
    api: z.string(),
    frontend: z.string(),
    sec: z.string(),
    a11y: z.string(),
    perf: z.string(),
    rt: z.string(),
    func: z.string(),
    env: z.string(),
  }),
  refs: z.array(z.tuple([z.string(), z.string()])),
  reports: z.object({
    api: specialistReportSchema.optional(),
    frontend: specialistReportSchema.optional(),
    sec: specialistReportSchema.optional(),
    a11y: specialistReportSchema.optional(),
    perf: specialistReportSchema.optional(),
    rt: specialistReportSchema.optional(),
    func: specialistReportSchema.optional(),
    env: specialistReportSchema.optional(),
  }),
});

/** Corridas de los agentes en `agents.json`, dentro de la carpeta de la sesión. */
export class FileAgentRunStore implements AgentRunStore {
  private readonly writes = new Map<string, Promise<void>>();

  constructor(private readonly paths: SessionPaths) {}

  async list(sessionId: string): Promise<AgentRun[]> {
    try {
      const raw = await readFile(this.paths.agentsFile(sessionId), 'utf8');
      return agentRunListSchema.parse(JSON.parse(raw)).runs;
    } catch (error) {
      if (isNotFound(error)) return [];
      throw error;
    }
  }

  async saveCheckpoint(sessionId: string, runId: string, checkpoint: AgentCheckpoint): Promise<void> {
    await writeFileAtomic(this.paths.agentCheckpointFile(sessionId, runId), JSON.stringify(checkpoint));
  }

  async loadCheckpoint(sessionId: string, runId: string): Promise<AgentCheckpoint | null> {
    try {
      const raw = await readFile(this.paths.agentCheckpointFile(sessionId, runId), 'utf8');
      return checkpointSchema.parse(JSON.parse(raw));
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  async save(run: AgentRun): Promise<void> {
    const snapshot = structuredClone(run);
    const previous = this.writes.get(run.sessionId) ?? Promise.resolve();
    const next = previous
      .catch(() => undefined)
      .then(async () => {
        const runs = (await this.list(run.sessionId)).filter((item) => item.id !== snapshot.id);
        const updated = [snapshot, ...runs].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
        await writeFileAtomic(this.paths.agentsFile(run.sessionId), `${JSON.stringify({ runs: updated }, null, 2)}\n`);
      });
    this.writes.set(run.sessionId, next);
    try {
      await next;
    } finally {
      if (this.writes.get(run.sessionId) === next) this.writes.delete(run.sessionId);
    }
  }
}
