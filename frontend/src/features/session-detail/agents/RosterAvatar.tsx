import type { AgentAnimation, AgentEyeShape, AgentGesture } from '@rastro/shared';
import styles from './AgentAvatar.module.css';
import { AgentEyes, AgentHead } from './agentVisuals';

interface RosterAvatarProps {
  color: string;
  name: string;
  eyeShape: AgentEyeShape;
  animation: AgentAnimation;
  gesture: AgentGesture;
  size?: number;
  /** Los agentes que todavía no corren quedan quietos: no fingir que están "vivos". */
  animate?: boolean;
  /** Para que no se muevan todos a la vez en una grilla. */
  delayMs?: number;
}

/**
 * Robot genérico del catálogo de agentes: mismo cuerpo que `AgentAvatar`, con
 * el color, la forma de ojos y el gesto propios de cada rol (la antena
 * distinta por tipo queda solo para los 3 agentes que de verdad corren, en
 * `AgentAvatar`).
 */
export function RosterAvatar({
  color,
  name,
  eyeShape,
  animation,
  gesture,
  size = 28,
  animate = true,
  delayMs = 0,
}: RosterAvatarProps) {
  return (
    <svg className={styles.avatar} width={size} height={size} viewBox="0 0 32 32" role="img" aria-label={`Agente ${name}`}>
      <title>{`Agente ${name}`}</title>
      <rect x="2" y="14" width="3" height="6" rx="1.5" fill={color} />
      <rect x="27" y="14" width="3" height="6" rx="1.5" fill={color} />
      <AgentHead gesture={gesture} animate={animate} delayMs={delayMs}>
        <line x1="16" y1="3.5" x2="16" y2="8" stroke={color} strokeWidth="2" strokeLinecap="round" />
        <circle cx="16" cy="3" r="2.2" fill={color} />
        <rect x="5" y="8" width="22" height="19" rx="6" fill={color} />
        <rect x="8.5" y="12.5" width="15" height="9" rx="4.5" fill="#ffffff" />
        <AgentEyes shape={eyeShape} color={color} animation={animation} animate={animate} delayMs={delayMs} />
      </AgentHead>
    </svg>
  );
}
