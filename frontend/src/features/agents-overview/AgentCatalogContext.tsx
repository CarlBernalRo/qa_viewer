import { AGENT_CATALOG, AGENT_ROSTER } from '@rastro/shared';
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useAgentSettings } from './api';
import { buildEffectiveCatalog, type EffectiveAgentCatalog } from './effectiveCatalog';

const FALLBACK: EffectiveAgentCatalog = { catalog: AGENT_CATALOG, roster: AGENT_ROSTER };

const AgentCatalogContext = createContext<EffectiveAgentCatalog>(FALLBACK);

/**
 * Une `AGENT_CATALOG`/`AGENT_ROSTER` (fijos) con los overrides guardados en `/agentes/:id`, una sola vez
 * para toda la app. Mientras la consulta no volvió (o no hay overrides), usa el catálogo fijo tal cual.
 */
export function AgentCatalogProvider({ children }: { children: ReactNode }) {
  const settings = useAgentSettings();
  const value = useMemo(() => (settings.data ? buildEffectiveCatalog(settings.data) : FALLBACK), [settings.data]);
  return <AgentCatalogContext.Provider value={value}>{children}</AgentCatalogContext.Provider>;
}

export function useAgentCatalog(): EffectiveAgentCatalog {
  return useContext(AgentCatalogContext);
}
