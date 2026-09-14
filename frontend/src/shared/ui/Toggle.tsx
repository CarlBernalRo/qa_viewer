import type { ReactNode } from 'react';
import { cx } from '../lib/cx';
import { InfoTip } from './InfoTip';
import styles from './Toggle.module.css';

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: ReactNode;
  /** Explicación detallada en un tooltip ⓘ. */
  info?: ReactNode;
  /** Marca de color a la izquierda (p. ej., el color del canal). */
  swatch?: string;
  disabled?: boolean;
}

export function Toggle({ checked, onChange, label, description, info, swatch, disabled = false }: ToggleProps) {
  return (
    <div className={styles.row}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        className={styles.switchButton}
        onClick={() => onChange(!checked)}
      >
        {swatch && <span className={styles.swatch} style={{ background: swatch }} aria-hidden="true" />}
        <span className={styles.text}>
          <span className={styles.label}>{label}</span>
          {description && <span className={styles.description}>{description}</span>}
        </span>
        <span className={cx(styles.track, checked && styles.on)} aria-hidden="true">
          <span className={styles.knob} />
        </span>
      </button>
      {info && <InfoTip label={`Qué es: ${label}`}>{info}</InfoTip>}
    </div>
  );
}
