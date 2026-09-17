import type { AgentAnimation, AgentEyeShape, AgentGesture } from '@rastro/shared';
import type { CSSProperties, ReactNode } from 'react';
import styles from './AgentAvatar.module.css';

// Los nombres deben coincidir con los @keyframes :global(...) de AgentAvatar.module.css:
// como se arman por texto acá y se pasan por variable CSS, CSS Modules no los puede
// renombrar, así que del lado del CSS también tienen que quedar sin scope.
/** Reposo (siempre) y ocupado (mientras analiza): mismo tipo de movimiento, más rápido y marcado al trabajar. */
const ANIMATIONS: Record<AgentAnimation, { idle: string; busy: string }> = {
  blink: { idle: 'rastro-agent-blink 5.5s steps(1) infinite', busy: 'rastro-agent-blink 1s steps(1) infinite' },
  'blink-slow': { idle: 'rastro-agent-blink 8.5s steps(1) infinite', busy: 'rastro-agent-blink 1.4s steps(1) infinite' },
  pulse: { idle: 'rastro-agent-pulse 3.2s ease-in-out infinite', busy: 'rastro-agent-pulse 0.8s ease-in-out infinite' },
  scan: { idle: 'rastro-agent-scan 3.6s ease-in-out infinite', busy: 'rastro-agent-scan 0.9s ease-in-out infinite' },
};

/** Gestos de cabeza: además de los ojos, cada agente inclina, gira o asiente a su ritmo. */
const GESTURES: Record<AgentGesture, { idle: string; busy: string }> = {
  tilt: { idle: 'rastro-agent-tilt 4.6s ease-in-out infinite', busy: 'rastro-agent-tilt 1.5s ease-in-out infinite' },
  turn: { idle: 'rastro-agent-turn 5.2s ease-in-out infinite', busy: 'rastro-agent-turn 1.7s ease-in-out infinite' },
  nod: { idle: 'rastro-agent-nod 3.8s ease-in-out infinite', busy: 'rastro-agent-nod 1.2s ease-in-out infinite' },
};

export interface AgentHeadProps {
  gesture: AgentGesture;
  /** Cabeza quieta: para el catálogo de agentes que todavía no corren. */
  animate?: boolean;
  /** Para que no todos giren la cabeza al mismo tiempo en una grilla. */
  delayMs?: number;
  children: ReactNode;
}

/**
 * Envuelve la antena, la cabeza, la cara y los ojos: gira, inclina o asiente según el agente.
 * Se acelera solo con la clase `.busy` del `<svg>` que la contiene (mismo mecanismo que los ojos).
 */
export function AgentHead({ gesture, animate = true, delayMs = 0, children }: AgentHeadProps) {
  if (!animate) return <>{children}</>;
  const anim = GESTURES[gesture];
  const style = {
    '--agent-gesture': anim.idle,
    '--agent-gesture-busy': anim.busy,
    '--agent-gesture-delay': `${delayMs}ms`,
  } as CSSProperties;
  return (
    <g className={styles.head} style={style}>
      {children}
    </g>
  );
}

export interface AgentEyesProps {
  shape: AgentEyeShape;
  color: string;
  animation: AgentAnimation;
  /** Ojos quietos: para el catálogo de agentes que todavía no corren. */
  animate?: boolean;
  /** Para que no se muevan todos a la vez en una grilla. */
  delayMs?: number;
}

/** Ojos del robot, con la forma y el movimiento propios de cada agente. */
export function AgentEyes({ shape, color, animation, animate = true, delayMs = 0 }: AgentEyesProps) {
  if (!animate) {
    if (shape === 'visor') return <rect x="9" y="14.6" width="14" height="4" rx="2" fill={color} />;
    if (shape === 'square') {
      return (
        <>
          <rect x="11.1" y="15" width="3.2" height="3.2" rx="0.6" fill={color} />
          <rect x="17.7" y="15" width="3.2" height="3.2" rx="0.6" fill={color} />
        </>
      );
    }
    return (
      <>
        <circle cx="13" cy="17" r="1.9" fill={color} />
        <circle cx="19" cy="17" r="1.9" fill={color} />
      </>
    );
  }

  const anim = ANIMATIONS[animation];
  const style = { '--agent-anim': anim.idle, '--agent-anim-busy': anim.busy, '--agent-blink-delay': `${delayMs}ms` } as CSSProperties;

  if (shape === 'visor') {
    return <rect x="9" y="14.6" width="14" height="4" rx="2" fill={color} className={styles.eye} style={style} />;
  }
  if (shape === 'square') {
    return (
      <>
        <rect x="11.1" y="15" width="3.2" height="3.2" rx="0.6" fill={color} className={styles.eye} style={style} />
        <rect x="17.7" y="15" width="3.2" height="3.2" rx="0.6" fill={color} className={styles.eye} style={style} />
      </>
    );
  }
  return (
    <>
      <circle cx="13" cy="17" r="1.9" fill={color} className={styles.eye} style={style} />
      <circle cx="19" cy="17" r="1.9" fill={color} className={styles.eye} style={style} />
    </>
  );
}
