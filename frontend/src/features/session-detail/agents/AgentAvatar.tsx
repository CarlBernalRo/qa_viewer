import { AGENT_CATALOG, type AgentId } from '@rastro/shared';
import { cx } from '../../../shared/lib/cx';
import styles from './AgentAvatar.module.css';

/** Lo que distingue a cada robot arriba de la cabeza: una antena, dos, o la insignia del líder. */
function Top({ agent, color }: { agent: AgentId; color: string }) {
  if (agent === 'frontend') {
    return (
      <>
        <line x1="11" y1="3" x2="12" y2="8" stroke={color} strokeWidth="2" strokeLinecap="round" />
        <line x1="21" y1="3" x2="20" y2="8" stroke={color} strokeWidth="2" strokeLinecap="round" />
      </>
    );
  }
  if (agent === 'lead') {
    return <path d="M10 8 L11.5 2.5 L16 5.5 L20.5 2.5 L22 8 Z" fill={color} />;
  }
  return (
    <>
      <line x1="16" y1="3.5" x2="16" y2="8" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <circle cx="16" cy="3" r="2.2" fill={color} />
    </>
  );
}

/** El robot de cada agente: mismo cuerpo, distinto color y cabeza según su rol. */
export function AgentAvatar({ agent, size = 28, busy = false }: { agent: AgentId; size?: number; busy?: boolean }) {
  const { color, name } = AGENT_CATALOG[agent];
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
      <Top agent={agent} color={color} />
      <rect x="2" y="14" width="3" height="6" rx="1.5" fill={color} />
      <rect x="27" y="14" width="3" height="6" rx="1.5" fill={color} />
      <rect x="5" y="8" width="22" height="19" rx="6" fill={color} />
      <rect x="8.5" y="12.5" width="15" height="9" rx="4.5" fill="#ffffff" />
      <circle className={styles.eye} cx="13" cy="17" r="1.9" fill={color} />
      <circle className={styles.eye} cx="19" cy="17" r="1.9" fill={color} />
    </svg>
  );
}
