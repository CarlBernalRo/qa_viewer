import { useId, type ReactNode } from 'react';
import { cx } from '../lib/cx';
import { usePersistentState } from '../lib/usePersistentState';
import styles from './Panel.module.css';

interface PanelProps {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  padded?: boolean;
  /** Ocupa todo el alto disponible y el contenido hace scroll propio. */
  fill?: boolean;
  /** Se puede plegar; el estado se recuerda con esta clave. */
  collapsibleKey?: string;
  defaultCollapsed?: boolean;
  className?: string;
  children: ReactNode;
}

export function Panel({
  title,
  subtitle,
  actions,
  padded = true,
  fill = false,
  collapsibleKey,
  defaultCollapsed = false,
  className,
  children,
}: PanelProps) {
  const bodyId = useId();
  const [collapsed, setCollapsed] = usePersistentState(`rastro.panel.${collapsibleKey ?? 'fijo'}`, defaultCollapsed);
  const isCollapsed = Boolean(collapsibleKey) && collapsed;

  return (
    <section className={cx(styles.panel, fill && styles.fill, className)}>
      {(title || actions) && (
        <header className={cx(styles.header, isCollapsed && styles.headerCollapsed)}>
          {collapsibleKey ? (
            <button
              type="button"
              className={styles.collapseToggle}
              aria-expanded={!isCollapsed}
              aria-controls={bodyId}
              onClick={() => setCollapsed(!collapsed)}
            >
              <span className={cx(styles.chevron, !isCollapsed && styles.chevronOpen)} aria-hidden="true">
                ▸
              </span>
              <span className={styles.titles}>
                {title && <span className={styles.title}>{title}</span>}
                {subtitle && <span className={styles.subtitle}>{subtitle}</span>}
              </span>
            </button>
          ) : (
            <div className={styles.titles}>
              {title && <h2 className={styles.title}>{title}</h2>}
              {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
            </div>
          )}
          {actions && <div className={styles.actions}>{actions}</div>}
        </header>
      )}
      {/* Plegado solo oculta: el contenido sigue montado (p. ej., el video conserva su posición). */}
      <div id={bodyId} hidden={isCollapsed} className={cx(padded && styles.body, fill && styles.scroll)}>
        {children}
      </div>
    </section>
  );
}
