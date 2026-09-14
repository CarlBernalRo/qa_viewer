import { useState, type KeyboardEvent } from 'react';
import { Chip } from './Chip';
import styles from './TagInput.module.css';

interface TagInputProps {
  id?: string;
  values: readonly string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  variant?: 'solid' | 'dashed';
  /** Devuelve un mensaje si el valor no es válido. */
  validate?: (value: string) => string | null;
  describedBy?: string | undefined;
}

/** Lista de valores como chips: Enter o coma agrega, × quita. */
export function TagInput({ id, values, onChange, placeholder, variant = 'solid', validate, describedBy }: TagInputProps) {
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);

  const commit = () => {
    const value = draft.trim();
    if (!value) return;
    const problem = validate?.(value) ?? null;
    if (problem) {
      setError(problem);
      return;
    }
    if (!values.includes(value)) onChange([...values, value]);
    setDraft('');
    setError(null);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      commit();
    } else if (event.key === 'Backspace' && !draft && values.length > 0) {
      onChange(values.slice(0, -1));
    }
  };

  return (
    <div className={styles.wrapper}>
      <div className={styles.box}>
        {values.map((value) => (
          <Chip
            key={value}
            variant={variant}
            mono
            onRemove={() => onChange(values.filter((item) => item !== value))}
            removeLabel={`Quitar ${value}`}
          >
            {value}
          </Chip>
        ))}
        <input
          id={id}
          className={styles.input}
          value={draft}
          placeholder={values.length === 0 ? placeholder : undefined}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onKeyDown}
          onBlur={commit}
          aria-describedby={describedBy}
          aria-invalid={error ? true : undefined}
        />
      </div>
      {error && (
        <span className={styles.error} role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
