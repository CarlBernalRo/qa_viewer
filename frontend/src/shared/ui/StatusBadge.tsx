import type { SessionStatus } from '@rastro/shared';
import { cx } from '../lib/cx';
import styles from './StatusBadge.module.css';

const LABELS: Record<SessionStatus, string> = {
  draft: 'Lista para grabar',
  recording: 'Grabando',
  completed: 'Grabada',
  failed: 'Falló',
};

export function StatusBadge({ status }: { status: SessionStatus }) {
  return (
    <span className={cx(styles.badge, styles[status])}>
      <span className={styles.dot} aria-hidden="true" />
      {LABELS[status]}
    </span>
  );
}
