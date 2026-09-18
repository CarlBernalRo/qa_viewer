import type { AgentId, AgentSettings } from '@rastro/shared';
import type { AgentSettingsStore } from '../../domain/ports.js';

export class GetAgentSettings {
  constructor(private readonly store: AgentSettingsStore) {}

  async execute(): Promise<Partial<Record<AgentId, AgentSettings>>> {
    return this.store.getAll();
  }
}

export class UpdateAgentSettings {
  constructor(private readonly store: AgentSettingsStore) {}

  async execute(agentId: AgentId, settings: AgentSettings): Promise<AgentSettings> {
    await this.store.set(agentId, settings);
    return settings;
  }
}
