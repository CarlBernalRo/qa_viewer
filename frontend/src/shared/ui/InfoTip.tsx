import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import styles from './InfoTip.module.css';

interface InfoTipProps {
  children: ReactNode;
  /** Nombre accesible del botón, p. ej. "Qué es el alcance". */
  label?: string;
}

const GAP = 8;
const EDGE = 12;
const MAX_WIDTH = 300;

interface Position {
  top: number;
  left: number;
  arrowLeft: number;
  placement: 'below' | 'above';
}

/**
 * Ícono ⓘ que muestra una explicación al pasar el mouse, enfocarlo o hacer click.
 * El globo se dibuja en <body> con posición fija: ninguna tarjeta con overflow lo corta,
 * y se reubica para no salirse de la pantalla.
 */
export function InfoTip({ children, label = 'Más información' }: InfoTipProps) {
  const id = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const bubbleRef = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<Position | null>(null);

  const place = useCallback(() => {
    const trigger = triggerRef.current;
    const bubble = bubbleRef.current;
    if (!trigger || !bubble) return;
    const anchor = trigger.getBoundingClientRect();
    const width = Math.min(MAX_WIDTH, bubble.offsetWidth);
    const height = bubble.offsetHeight;
    const centerX = anchor.left + anchor.width / 2;
    const left = Math.min(Math.max(EDGE, centerX - 24), window.innerWidth - width - EDGE);
    const fitsBelow = anchor.bottom + GAP + height <= window.innerHeight - EDGE;
    const top = fitsBelow ? anchor.bottom + GAP : Math.max(EDGE, anchor.top - GAP - height);
    setPosition({ top, left, arrowLeft: centerX - left - 5, placement: fitsBelow ? 'below' : 'above' });
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

  const close = () => {
    setOpen(false);
    setPosition(null);
  };

  return (
    <span className={styles.wrap} onMouseEnter={() => setOpen(true)} onMouseLeave={close}>
      <button
        ref={triggerRef}
        type="button"
        className={styles.trigger}
        aria-label={label}
        aria-describedby={open ? id : undefined}
        aria-expanded={open}
        onFocus={() => setOpen(true)}
        onBlur={close}
        onClick={(event) => {
          event.preventDefault();
          if (open) close();
          else setOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') close();
        }}
      >
        i
      </button>
      {open &&
        createPortal(
          <span
            ref={bubbleRef}
            role="tooltip"
            id={id}
            className={styles.bubble}
            data-placement={position?.placement ?? 'below'}
            style={{
              top: position?.top ?? -9999,
              left: position?.left ?? -9999,
              ['--arrow-left' as string]: `${position?.arrowLeft ?? 16}px`,
            }}
          >
            {children}
          </span>,
          document.body,
        )}
    </span>
  );
}
