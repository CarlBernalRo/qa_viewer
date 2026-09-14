import type { SessionDto } from '@rastro/shared';
import { runningInTauri } from '../../shared/config/backendConfig';
import { formatClock, sessionDurationMs } from '../../shared/lib/format';
import { Button, ErrorMessage } from '../../shared/ui';
import { useLiveStats, useRecordingControls } from '../sessions/api';
import { MarkerForm } from './markers/MarkerForm';
import { useMarkNow } from './markers/useMarkNow';
import styles from './SessionDetail.module.css';
import { useNow } from './useNow';

interface RecordingPanelProps {
  session: SessionDto;
  /** Vuelve al widget flotante (solo en la app de escritorio). */
  onCompact?: () => void;
}

/** Barra de grabación en vivo dentro de la vista completa: tiempo, contadores y botón para detener. */
export function RecordingPanel({ session, onCompact }: RecordingPanelProps) {
  const live = useLiveStats(session.id);
  const { stop } = useRecordingControls(session.id);
  const mark = useMarkNow(session);
  const now = useNow(250);
  const stats = live.data?.stats ?? session.stats;
  const counters: Array<[string, number, boolean?]> = [
    ['acciones', stats.actions],
    ['requests', stats.requests],
    ['frames WS', stats.wsFrames],
    ['logs', stats.consoleLogs],
    ['errores', stats.errors, stats.errors > 0],
  ];

  return (
    <section className={styles.hud} aria-live="polite">
      <div className={styles.hudTop}>
        <span className={styles.recDot} aria-hidden="true" />
        <span className={styles.recLabel}>REC</span>
        <span className={styles.recClock}>{formatClock(sessionDurationMs(session.startedAt, undefined, now), false)}</span>
        <span className={styles.hudUrl}>
          {session.capture.environment} · {session.capture.startUrl}
        </span>
      </div>
      <div className={styles.counters}>
        {counters.map(([label, value, alert]) => (
          <div key={label} className={styles.counter}>
            <span className={styles.counterValue} data-alert={alert || undefined}>
              {value}
            </span>
            <span className={styles.counterLabel}>{label}</span>
          </div>
        ))}
      </div>
      <p className={styles.hudNote}>
        Navega en la ventana de Chromium que se abrió. Cerrar esa ventana también termina la grabación.
      </p>
      <ErrorMessage error={stop.error ?? mark.error} />
      {mark.marking && (
        <MarkerForm
          tone="dark"
          criteria={session.objective.criteria}
          pending={mark.pending}
          submitLabel={`Marcar ${formatClock(mark.markingAt ?? 0, false)}`}
          onSubmit={mark.submit}
          onCancel={mark.cancel}
        />
      )}
      {mark.lastSavedAt !== null && (
        <p className={styles.hudNote}>✓ Marca guardada en {formatClock(mark.lastSavedAt, false)}.</p>
      )}
      <div className={styles.hudActions}>
        <Button variant="secondary" className={styles.stopButton} loading={stop.isPending} onClick={() => stop.mutate()}>
          Detener grabación
        </Button>
        {!mark.marking && (
          <Button variant="ghost" className={styles.compactButton} onClick={mark.start}>
            📍 Marcar momento
          </Button>
        )}
        {onCompact && runningInTauri() && (
          <Button variant="ghost" className={styles.compactButton} onClick={onCompact}>
            Volver al widget
          </Button>
        )}
      </div>
    </section>
  );
}
