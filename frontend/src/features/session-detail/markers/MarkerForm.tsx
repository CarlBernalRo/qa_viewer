import type { AcceptanceCriterion } from '@rastro/shared';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { cx } from '../../../shared/lib/cx';
import styles from './MarkerForm.module.css';

export interface MarkerDraft {
  criterionId: string | null;
  note: string;
}

interface MarkerFormProps {
  criteria: readonly AcceptanceCriterion[];
  pending: boolean;
  /** Oscuro para el widget y la barra de grabación; claro para la revisión. */
  tone?: 'dark' | 'light';
  submitLabel?: string;
  onSubmit: (draft: MarkerDraft) => void;
  onCancel: () => void;
}

const shortText = (text: string) => (text.length > 60 ? `${text.slice(0, 59)}…` : text);

/** Criterio (opcional) + nota: lo mínimo para dejar un momento como evidencia. */
export function MarkerForm({
  criteria,
  pending,
  tone = 'light',
  submitLabel = 'Guardar marca',
  onSubmit,
  onCancel,
}: MarkerFormProps) {
  const [criterionId, setCriterionId] = useState('');
  const [note, setNote] = useState('');
  const noteRef = useRef<HTMLInputElement>(null);
  const canSave = !pending && (criterionId !== '' || note.trim() !== '');

  useEffect(() => {
    noteRef.current?.focus();
  }, []);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (canSave) onSubmit({ criterionId: criterionId || null, note: note.trim() });
  };

  return (
    <form
      className={cx(styles.form, styles[tone])}
      onSubmit={submit}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onCancel();
      }}
    >
      <select
        aria-label="Criterio"
        className={styles.field}
        value={criterionId}
        onChange={(event) => setCriterionId(event.target.value)}
      >
        <option value="">Sin criterio</option>
        {criteria.map((criterion) => (
          <option key={criterion.id} value={criterion.id} title={criterion.text}>
            {criterion.id} · {shortText(criterion.text)}
          </option>
        ))}
      </select>
      <input
        ref={noteRef}
        aria-label="Nota"
        className={cx(styles.field, styles.note)}
        value={note}
        maxLength={500}
        placeholder="Qué viste (opcional si eliges un criterio)"
        onChange={(event) => setNote(event.target.value)}
      />
      <div className={styles.buttons}>
        <button type="submit" className={styles.save} disabled={!canSave}>
          {pending ? 'Guardando…' : submitLabel}
        </button>
        <button type="button" className={styles.cancel} onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
