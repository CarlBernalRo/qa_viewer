import { readFile } from 'node:fs/promises';
import { agentSettingsMapSchema, type AgentId, type AgentSettings } from '@rastro/shared';
import type { AgentSettingsStore } from '../../domain/ports.js';
import { isNotFound, writeFileAtomic } from './fs-utils.js';

/** Todos los overrides en un solo índice (`agent-settings.json`), uno por agente como mucho. */
export class FileAgentSettingsStore implements AgentSettingsStore {
  private writes: Promise<void> = Promise.resolve();

  constructor(private readonly filePath: string) {}

  async getAll(): Promise<Partial<Record<AgentId, AgentSettings>>> {
    try {
      const raw = await readFile(this.filePath, 'utf8');
      return agentSettingsMapSchema.parse(JSON.parse(raw));
    } catch (error) {
      if (isNotFound(error)) return {};
      throw error;
    }
  }

  async get(agentId: AgentId): Promise<AgentSettings> {
    return (await this.getAll())[agentId] ?? {};
  }

  async set(agentId: AgentId, settings: AgentSettings): Promise<void> {
    const next = this.writes
      .catch(() => undefined)
      .then(async () => {
        const all = await this.getAll();
        const updated = { ...all, [agentId]: settings };
        await writeFileAtomic(this.filePath, `${JSON.stringify(updated, null, 2)}\n`);
      });
    this.writes = next;
    await next;
  }
}
