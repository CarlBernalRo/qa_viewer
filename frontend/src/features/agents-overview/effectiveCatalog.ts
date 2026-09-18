import {
  AGENT_CATALOG,
  AGENT_ORDER,
  AGENT_ROSTER,
  AGENT_ROSTER_ORDER,
  type AgentId,
  type AgentMeta,
  type AgentRosterId,
  type AgentRosterMeta,
  type AgentSettings,
} from '@rastro/shared';

/** El override reemplaza color/rol/avatar cuando está definido; si no, queda lo del catálogo fijo. */
function mergeMeta<T extends AgentMeta>(base: T, override: AgentSettings | undefined): T {
  if (!override) return base;
  return {
    ...base,
    ...(override.color ? { color: override.color } : {}),
    ...(override.mainObjective ? { role: override.mainObjective } : {}),
  };
}

function mergeRosterMeta(base: AgentRosterMeta, override: AgentSettings | undefined): AgentRosterMeta {
  if (!override) return base;
  return {
    ...mergeMeta(base, override),
    ...(override.eyeShape ? { eyeShape: override.eyeShape } : {}),
    ...(override.animation ? { animation: override.animation } : {}),
    ...(override.gesture ? { gesture: override.gesture } : {}),
  };
}

const AGENT_ID_SET = new Set<string>(AGENT_ORDER);

export interface EffectiveAgentCatalog {
  catalog: Record<AgentId, AgentMeta>;
  roster: Record<AgentRosterId, AgentRosterMeta>;
}

/** `AGENT_CATALOG`/`AGENT_ROSTER` con los overrides guardados aplicados. Sin overrides, es exactamente el catálogo fijo. */
export function buildEffectiveCatalog(settings: Partial<Record<AgentId, AgentSettings>>): EffectiveAgentCatalog {
  const catalog = Object.fromEntries(
    AGENT_ORDER.map((id) => [id, mergeMeta(AGENT_CATALOG[id], settings[id])]),
  ) as Record<AgentId, AgentMeta>;
  const roster = Object.fromEntries(
    AGENT_ROSTER_ORDER.map((id) => [
      id,
      mergeRosterMeta(AGENT_ROSTER[id], AGENT_ID_SET.has(id) ? settings[id as AgentId] : undefined),
    ]),
  ) as Record<AgentRosterId, AgentRosterMeta>;
  return { catalog, roster };
}
