import type { ReactNode } from 'react';
import { cx } from '../lib/cx';
import styles from './Chip.module.css';

interface ChipProps {
  children: ReactNode;
  variant?: 'solid' | 'outline' | 'dashed' | 'soft';
  mono?: boolean;
  onRemove?: () => void;
  removeLabel?: string;
}

export function Chip({ children, variant = 'outline', mono = false, onRemove, removeLabel }: ChipProps) {
  return (
    <span className={cx(styles.chip, styles[variant], mono && styles.mono)}>
      {children}
      {onRemove && (
        <button type="button" className={styles.remove} onClick={onRemove} aria-label={removeLabel ?? 'Quitar'}>
          ×
        </button>
      )}
    </span>
  );
}
