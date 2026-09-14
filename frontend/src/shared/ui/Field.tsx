import {
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { cx } from '../lib/cx';
import styles from './Field.module.css';
import { InfoTip } from './InfoTip';

interface FieldProps {
  label: ReactNode;
  hint?: ReactNode;
  /** Explicación detallada en un tooltip ⓘ junto a la etiqueta. */
  info?: ReactNode;
  error?: string | undefined;
  optional?: boolean;
  /** Recibe el id que debe llevar el control, para enlazarlo con la etiqueta. */
  children: (controlId: string, describedBy: string | undefined) => ReactNode;
}

/** Etiqueta + control + ayuda + error, siempre enlazados por id para accesibilidad. */
export function Field({ label, hint, info, error, optional = false, children }: FieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;
  return (
    <div className={styles.field}>
      <div className={styles.labelRow}>
        <label htmlFor={id} className={styles.label}>
          {label}
          {optional && <span className={styles.optional}> (opcional)</span>}
        </label>
        {info && <InfoTip label={`Qué es: ${typeof label === 'string' ? label : 'este campo'}`}>{info}</InfoTip>}
      </div>
      {children(id, describedBy)}
      {hint && !error && (
        <span id={hintId} className={styles.hint}>
          {hint}
        </span>
      )}
      {error && (
        <span id={errorId} className={styles.error} role="alert">
          {error}
        </span>
      )}
    </div>
  );
}

type Invalid = { invalid?: boolean };

export function TextInput({ invalid, className, ...props }: InputHTMLAttributes<HTMLInputElement> & Invalid) {
  return <input className={cx(styles.control, className)} aria-invalid={invalid || undefined} {...props} />;
}

export function TextArea({ invalid, className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement> & Invalid) {
  return (
    <textarea
      className={cx(styles.control, styles.textarea, className)}
      aria-invalid={invalid || undefined}
      {...props}
    />
  );
}

export function Select({ invalid, className, ...props }: SelectHTMLAttributes<HTMLSelectElement> & Invalid) {
  return <select className={cx(styles.control, className)} aria-invalid={invalid || undefined} {...props} />;
}
