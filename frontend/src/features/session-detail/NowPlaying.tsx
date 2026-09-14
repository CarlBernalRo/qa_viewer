import { cx } from '../../shared/lib/cx';
import { formatClock } from '../../shared/lib/format';
import styles from './SessionDetail.module.css';
import type { TimelineItem, TimelineModel } from './timeline/buildTimeline';

interface NowPlayingProps {
  model: TimelineModel;
  active: TimelineItem[];
  currentMs: number;
  onSelect: (item: TimelineItem) => void;
}

const MAX_VISIBLE = 5;

/** Qué está pasando en el momento del video que se está viendo. */
export function NowPlaying({ model, active, currentMs, onSelect }: NowPlayingProps) {
  const colorOf = (item: TimelineItem) => model.lanes.find((lane) => lane.id === item.lane)?.color ?? 'var(--muted)';
  const visible = [...active].sort((a, b) => a.start - b.start).slice(0, MAX_VISIBLE);

  return (
    <div className={styles.nowPlaying} aria-live="polite">
      <span className={styles.nowLabel}>En {formatClock(currentMs)}</span>
      {visible.length === 0 ? (
        <span className={styles.muted}>Sin eventos en este momento.</span>
      ) : (
        <div className={styles.nowItems}>
          {visible.map((item) => (
            <button
              key={item.id}
              type="button"
              className={cx(styles.nowItem, item.severity !== 'normal' && styles[item.severity])}
              onClick={() => onSelect(item)}
              title={item.label}
            >
              <span className={styles.nowDot} style={{ background: colorOf(item) }} aria-hidden="true" />
              <span className={styles.nowText}>{item.label}</span>
            </button>
          ))}
          {active.length > MAX_VISIBLE && <span className={styles.muted}>+{active.length - MAX_VISIBLE}</span>}
        </div>
      )}
    </div>
  );
}
