import type { ReactNode } from 'react';
import { cx } from '../../shared/lib/cx';
import styles from './AnalysisLane.module.css';

export type LaneVariant = 'deterministic' | 'ai';

interface AnalysisLaneProps {
  variant: LaneVariant;
  children: ReactNode;
}

const LANE_META: Record<LaneVariant, { title: string; subtitle: string; iconLabel: string }> = {
  deterministic: {
    title: 'Análisis del programa',
    subtitle: 'Reglas fijas y deterministas — sin IA',
    iconLabel: 'Engranaje',
  },
  ai: {
    title: 'Análisis de IA',
    subtitle: 'Agentes de IA especializados',
    iconLabel: 'Estrella',
  },
};

function GearIcon() {
  return (
    <svg className={styles.iconGear} width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path
        d="M9 11.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <path
        d="M7.7 2.2a1 1 0 0 1 1-.8h.6a1 1 0 0 1 1 .8l.16.98a.6.6 0 0 0 .4.44l.2.07a.6.6 0 0 0 .58-.08l.78-.6a1 1 0 0 1 1.28.08l.42.42a1 1 0 0 1 .08 1.28l-.6.78a.6.6 0 0 0-.08.58l.07.2a.6.6 0 0 0 .44.4l.98.16a1 1 0 0 1 .8 1v.6a1 1 0 0 1-.8 1l-.98.16a.6.6 0 0 0-.44.4l-.07.2a.6.6 0 0 0 .08.58l.6.78a1 1 0 0 1-.08 1.28l-.42.42a1 1 0 0 1-1.28.08l-.78-.6a.6.6 0 0 0-.58-.08l-.2.07a.6.6 0 0 0-.4.44l-.16.98a1 1 0 0 1-1 .8h-.6a1 1 0 0 1-1-.8l-.16-.98a.6.6 0 0 0-.4-.44l-.2-.07a.6.6 0 0 0-.58.08l-.78.6a1 1 0 0 1-1.28-.08l-.42-.42a1 1 0 0 1-.08-1.28l.6-.78a.6.6 0 0 0 .08-.58l-.07-.2a.6.6 0 0 0-.44-.4l-.98-.16a1 1 0 0 1-.8-1v-.6a1 1 0 0 1 .8-1l.98-.16a.6.6 0 0 0 .44-.4l.07-.2a.6.6 0 0 0-.08-.58l-.6-.78a1 1 0 0 1 .08-1.28l.42-.42a1 1 0 0 1 1.28-.08l.78.6a.6.6 0 0 0 .58.08l.2-.07a.6.6 0 0 0 .4-.44L7.7 2.2Z"
        stroke="currentColor"
        strokeWidth="1.2"
      />
    </svg>
  );
}

function SparkIcon() {
  return (
    <svg className={styles.iconSpark} width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path
        d="M9 1.5l1.76 4.98L16 9l-5.24 2.52L9 16.5l-1.76-4.98L2 9l5.24-2.52L9 1.5Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      <path
        d="M14.5 2l.6 1.7L16.8 4.3l-1.7.6L14.5 6.6l-.6-1.7L12.2 4.3l1.7-.6L14.5 2Z"
        fill="currentColor"
        opacity="0.5"
      />
    </svg>
  );
}

/**
 * Visual grouping wrapper that separates "program analysis" panels from
 * "AI analysis" panels.  Each lane gets its own accent color, icon, and
 * label so the user can immediately tell which source produced the results.
 */
export function AnalysisLane({ variant, children }: AnalysisLaneProps) {
  const { title, subtitle, iconLabel } = LANE_META[variant];
  return (
    <section className={cx(styles.lane, styles[variant])} aria-label={title}>
      <div className={styles.header}>
        <div className={styles.headerBar} aria-hidden="true" />
        <span className={styles.icon} aria-label={iconLabel}>
          {variant === 'deterministic' ? <GearIcon /> : <SparkIcon />}
        </span>
        <div className={styles.headerText}>
          <h2 className={styles.title}>{title}</h2>
          <span className={styles.subtitle}>{subtitle}</span>
        </div>
      </div>
      <div className={styles.content}>{children}</div>
    </section>
  );
}
