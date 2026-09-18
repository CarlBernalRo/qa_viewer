import type { AgentId } from '@rastro/shared';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useAgentCatalog } from '../../agents-overview/AgentCatalogContext';
import styles from './AgentTooltip.module.css';

const GAP = 10;
const EDGE = 12;

interface Position {
  top: number;
  left: number;
  arrowLeft: number;
  placement: 'below' | 'above';
}

interface AgentTooltipProps {
  agent: AgentId;
  children: ReactNode;
  /** Extra context line (e.g. the step status or a short summary). */
  extra?: string;
}

/**
 * Wraps any trigger element (usually an AgentAvatar) and shows a rich, styled
 * tooltip on hover/focus with the agent's name, role, what it reads, and accent
 * color.  Rendered as a portal so it escapes any `overflow: hidden` ancestors.
 */
export function AgentTooltip({ agent, children, extra }: AgentTooltipProps) {
  const { catalog } = useAgentCatalog();
  const { name, role, reads, color } = catalog[agent];
  const triggerRef = useRef<HTMLSpanElement>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<Position | null>(null);

  const place = useCallback(() => {
    const trigger = triggerRef.current;
    const bubble = bubbleRef.current;
    if (!trigger || !bubble) return;
    const anchor = trigger.getBoundingClientRect();
    const bw = bubble.offsetWidth;
    const bh = bubble.offsetHeight;
    const centerX = anchor.left + anchor.width / 2;
    const left = Math.min(Math.max(EDGE, centerX - bw / 2), window.innerWidth - bw - EDGE);
    const fitsBelow = anchor.bottom + GAP + bh <= window.innerHeight - EDGE;
    const top = fitsBelow ? anchor.bottom + GAP : Math.max(EDGE, anchor.top - GAP - bh);
    setPosition({ top, left, arrowLeft: centerX - left - 6, placement: fitsBelow ? 'below' : 'above' });
  }, []);

  useLayoutEffect(() => {
    if (open) place();
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const update = () => place();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [open, place]);

  return (
    <span
      ref={triggerRef}
      className={styles.trigger}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {children}
      {open &&
        createPortal(
          <div
            ref={bubbleRef}
            role="tooltip"
            className={styles.bubble}
            data-placement={position?.placement ?? 'below'}
            style={{
              top: position?.top ?? -9999,
              left: position?.left ?? -9999,
              '--arrow-left': `${position?.arrowLeft ?? 16}px`,
              '--agent-color': color,
            } as CSSProperties}
          >
            <div className={styles.bubbleBar} aria-hidden="true" />
            <div className={styles.header}>
              <strong className={styles.name}>{name}</strong>
              <span className={styles.id}>{agent}</span>
            </div>
            <p className={styles.role}>{role}</p>
            <div className={styles.meta}>
              <span className={styles.metaLabel}>Lee</span>
              <span className={styles.metaValue}>{reads}</span>
            </div>
            {extra && <p className={styles.extra}>{extra}</p>}
          </div>,
          document.body,
        )}
    </span>
  );
}
