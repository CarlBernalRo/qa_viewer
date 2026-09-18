import type { AgentId } from '@rastro/shared';
import { useAgentCatalog } from '../../agents-overview/AgentCatalogContext';
import { cx } from '../../../shared/lib/cx';
import styles from './AgentAvatar.module.css';
import { AgentEyes, AgentHead, AgentTop } from './agentVisuals';

/** El robot de cada agente: mismo cuerpo, distinto color y cabeza según su rol. */
export function AgentAvatar({ agent, size = 28, busy = false }: { agent: AgentId; size?: number; busy?: boolean }) {
  const { catalog, roster } = useAgentCatalog();
  const { color, name } = catalog[agent];
  const { eyeShape, animation, gesture } = roster[agent];
  return (
    <svg
      className={cx(styles.avatar, busy && styles.busy)}
      width={size}
      height={size}
      viewBox="0 0 32 32"
      role="img"
      aria-label={`Agente ${name}`}
    >
      <title>{`Agente ${name}`}</title>
      <rect x="2" y="14" width="3" height="6" rx="1.5" fill={color} />
      <rect x="27" y="14" width="3" height="6" rx="1.5" fill={color} />
      <AgentHead gesture={gesture}>
        <AgentTop agent={agent} color={color} />
        <rect x="5" y="8" width="22" height="19" rx="6" fill={color} />
        <rect x="8.5" y="12.5" width="15" height="9" rx="4.5" fill="#ffffff" />
        <AgentEyes shape={eyeShape} color={color} animation={animation} />
      </AgentHead>
    </svg>
  );
}

