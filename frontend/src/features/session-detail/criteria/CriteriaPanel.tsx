import {
  emptyReview,
  summarizeCriteria,
  type AcceptanceCriterion,
  type CriteriaSummary,
  type CriterionReview,
  type CriterionVerdict,
  type Marker,
  type SessionDto,
  type SessionReview,
} from '@rastro/shared';
import { useState } from 'react';
import { cx } from '../../../shared/lib/cx';
import { formatClock } from '../../../shared/lib/format';
import { ErrorMessage, InfoTip, Panel } from '../../../shared/ui';
import { useReviewMutations } from '../../sessions/api';
import { MarkerForm } from '../markers/MarkerForm';
import styles from './CriteriaPanel.module.css';

const OPTIONS: ReadonlyArray<{ value: CriterionVerdict | null; label: string }> = [
  { value: null, label: 'Pendiente' },
  { value: 'pass', label: 'Cumple' },
  { value: 'fail', label: 'No cumple' },
  { value: 'blocked', label: 'Bloqueado' },
];

const count = (value: number, singular: string, plural: string) =>
  value > 0 ? `${value} ${value === 1 ? singular : plural}` : null;

function summaryText(summary: CriteriaSummary): string {
  return [
    count(summary.pass, 'cumple', 'cumplen'),
    count(summary.fail, 'no cumple', 'no cumplen'),
    count(summary.blocked, 'bloqueado', 'bloqueados'),
    count(summary.pending, 'pendiente', 'pendientes'),
  ]
    .filter((part): part is string => part !== null)
    .join(' · ');
}

function MarkerChips({
  markers,
  onSeek,
  onRemove,
}: {
  markers: readonly Marker[];
  onSeek: (ms: number) => void;
  onRemove: (markerId: string) => void;
}) {
  return (
    <ul className={styles.markers}>
      {markers.map((marker) => (
        <li key={marker.id} className={styles.marker}>
          <button type="button" className={styles.markerSeek} title="Ver este momento del video" onClick={() => onSeek(marker.t)}>
            📍 <span className="mono">{formatClock(marker.t)}</span>
            {marker.note && <span className={styles.markerNote}>{marker.note}</span>}
          </button>
          <button type="button" className={styles.markerRemove} aria-label="Borrar marca" onClick={() => onRemove(marker.id)}>
            ×
          </button>
        </li>
      ))}
    </ul>
  );
}

interface CriterionRowProps {
  criterion: AcceptanceCriterion;
  review: CriterionReview | undefined;
  markers: readonly Marker[];
  pending: boolean;
  onVerdict: (verdict: CriterionVerdict | null, note?: string) => void;
  onSeek: (ms: number) => void;
  onRemoveMarker: (markerId: string) => void;
}

function CriterionRow({ criterion, review, markers, pending, onVerdict, onSeek, onRemoveMarker }: CriterionRowProps) {
  const [note, setNote] = useState(review?.note ?? '');
  const current = review?.verdict ?? null;
  return (
    <li className={styles.criterion}>
      <div className={styles.head}>
        <span className={styles.id}>{criterion.id}</span>
        <span>{criterion.text}</span>
      </div>
      <div className={styles.verdicts} role="radiogroup" aria-label={`Veredicto de ${criterion.id}`}>
        {OPTIONS.map(({ value, label }) => (
          <button
            key={label}
            type="button"
            role="radio"
            aria-checked={current === value}
            disabled={pending}
            className={cx(styles.verdict, current === value && styles[`on_${value ?? 'pending'}`])}
            onClick={() => onVerdict(value, value ? note.trim() || undefined : undefined)}
          >
            {label}
          </button>
        ))}
      </div>
      {current && (
        <input
          aria-label={`Nota de ${criterion.id}`}
          className={styles.note}
          value={note}
          maxLength={1000}
          placeholder="Nota (opcional): por qué, con qué datos…"
          onChange={(event) => setNote(event.target.value)}
          onBlur={() => {
            if (note.trim() !== (review?.note ?? '')) onVerdict(current, note.trim() || undefined);
          }}
        />
      )}
      {markers.length > 0 && <MarkerChips markers={markers} onSeek={onSeek} onRemove={onRemoveMarker} />}
    </li>
  );
}

interface CriteriaPanelProps {
  session: SessionDto;
  review: SessionReview | undefined;
  loading: boolean;
  /** Momento del video que se está viendo (reloj de la sesión). */
  currentMs: number;
  onSeek: (ms: number) => void;
}

/** El QA decide si se cumplió cada criterio, con las marcas como evidencia. */
export function CriteriaPanel({ session, review, loading, currentMs, onSeek }: CriteriaPanelProps) {
  const { addMarker, removeMarker, setVerdict } = useReviewMutations(session.id);
  const [markAt, setMarkAt] = useState<number | null>(null);
  const { criteria } = session.objective;
  const data = review ?? emptyReview();
  const summary = summarizeCriteria(
    criteria.map((criterion) => criterion.id),
    data,
  );
  const loose = data.markers.filter((marker) => marker.criterionId === null);
  const error = setVerdict.error ?? addMarker.error ?? removeMarker.error;

  return (
    <Panel
      collapsibleKey="criteria"
      title="Criterios de aceptación"
      subtitle={loading ? 'Cargando…' : summaryText(summary)}
      actions={
        <InfoTip label="Cómo se evalúan los criterios">
          Decides tú si cada criterio se cumple. Las marcas que hiciste al grabar (o las que agregues ahora) son la
          evidencia: haz clic en una para ver ese momento del video. El resultado sale en el informe PDF.
        </InfoTip>
      }
    >
      <ErrorMessage error={error} />
      <ul className={styles.list}>
        {criteria.map((criterion) => {
          const criterionReview = data.criteria[criterion.id];
          return (
            <CriterionRow
              // Cuando se guarda, la nota se reinicia desde lo que quedó en el servidor.
              key={`${criterion.id}:${criterionReview?.updatedAt ?? ''}`}
              criterion={criterion}
              review={criterionReview}
              markers={data.markers.filter((marker) => marker.criterionId === criterion.id)}
              pending={setVerdict.isPending && setVerdict.variables.criterionId === criterion.id}
              onVerdict={(verdict, note) =>
                setVerdict.mutate({ criterionId: criterion.id, verdict, ...(note ? { note } : {}) })
              }
              onSeek={onSeek}
              onRemoveMarker={(markerId) => removeMarker.mutate(markerId)}
            />
          );
        })}
      </ul>

      {loose.length > 0 && (
        <div className={styles.loose}>
          <h3>Notas sin criterio</h3>
          <MarkerChips markers={loose} onSeek={onSeek} onRemove={(markerId) => removeMarker.mutate(markerId)} />
        </div>
      )}

      <div className={styles.markBar}>
        {markAt === null ? (
          <button type="button" className={styles.markButton} onClick={() => setMarkAt(currentMs)}>
            📍 Marcar este momento ({formatClock(currentMs)})
          </button>
        ) : (
          <>
            <span className={styles.markingAt}>Marca en {formatClock(markAt)}</span>
            <MarkerForm
              criteria={criteria}
              pending={addMarker.isPending}
              onCancel={() => setMarkAt(null)}
              onSubmit={(draft) => addMarker.mutate({ ...draft, t: markAt }, { onSuccess: () => setMarkAt(null) })}
            />
          </>
        )}
      </div>
    </Panel>
  );
}
