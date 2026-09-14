import type { SessionDto } from '@rastro/shared';
import { formatClock, sessionDurationMs } from '../../shared/lib/format';
import { IconExpand } from '../../shared/ui';
import { useLiveStats, useRecordingControls } from '../sessions/api';
import { MarkerForm } from './markers/MarkerForm';
import { useMarkNow } from './markers/useMarkNow';
import { useNow } from './useNow';
import styles from './RecordingWidget.module.css';

interface RecordingWidgetProps {
  session: SessionDto;
  onExpand: () => void;
}

/**
 * Vista compacta mientras se graba: la ventana de Rastro se vuelve un widget
 * flotante y el navegador queda libre a pantalla completa.
 */
export function RecordingWidget({ session, onExpand }: RecordingWidgetProps) {
  const live = useLiveStats(session.id);
  const { stop } = useRecordingControls(session.id);
  const mark = useMarkNow(session);
  const now = useNow(250);
  const stats = live.data?.stats ?? session.stats;

  const hint = stop.error
    ? 'No se pudo detener. Reintenta.'
    : mark.error
      ? 'No se pudo guardar la marca.'
      : mark.lastSavedAt !== null
        ? `✓ Marca en ${formatClock(mark.lastSavedAt, false)}`
        : 'Arrastra para mover';

  return (
    <div className={styles.widget} data-tauri-drag-region>
      <div className={styles.top} data-tauri-drag-region>
        <span className={styles.recDot} aria-hidden="true" />
        <span className={styles.rec} data-tauri-drag-region>
          REC
        </span>
        <span className={styles.clock} data-tauri-drag-region>
          {formatClock(sessionDurationMs(session.startedAt, undefined, now), false)}
        </span>
        <span className={styles.name} data-tauri-drag-region title={session.objective.sessionName}>
          {session.objective.sessionName}
        </span>
        <button type="button" className={styles.expand} onClick={onExpand} title="Abrir Rastro completo" aria-label="Abrir Rastro completo">
          <IconExpand width={16} height={16} />
        </button>
      </div>
      {mark.marking ? (
        <MarkerForm
          tone="dark"
          criteria={session.objective.criteria}
          pending={mark.pending}
          submitLabel={`Marcar ${formatClock(mark.markingAt ?? 0, false)}`}
          onSubmit={mark.submit}
          onCancel={mark.cancel}
        />
      ) : (
        <>
          <div className={styles.stats} data-tauri-drag-region aria-live="polite">
            <span>
              <strong>{stats.actions}</strong> acciones
            </span>
            <span>
              <strong>{stats.requests}</strong> requests
            </span>
            <span>
              <strong>{stats.wsFrames}</strong> WS
            </span>
            <span className={stats.errors > 0 ? styles.alert : undefined}>
              <strong>{stats.errors}</strong> errores
            </span>
          </div>
          <div className={styles.bottom}>
            <button type="button" className={styles.stop} onClick={() => stop.mutate()} disabled={stop.isPending}>
              <span className={styles.stopIcon} aria-hidden="true" />
              {stop.isPending ? 'Deteniendo…' : 'Detener grabación'}
            </button>
            <button
              type="button"
              className={styles.mark}
              onClick={mark.start}
              title="Marca este momento como evidencia de un criterio"
            >
              📍 Marcar
            </button>
            <span className={styles.hint} data-tauri-drag-region aria-live="polite">
              {hint}
            </span>
          </div>
        </>
      )}
    </div>
  );
}
