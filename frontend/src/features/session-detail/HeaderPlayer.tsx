import { useEffect, useState } from 'react';
import { formatClock } from '../../shared/lib/format';
import styles from './HeaderPlayer.module.css';

const SKIP_SECONDS = 5;

/** Operaciones sobre el <video>: viven fuera del componente porque modifican el elemento que llega por props. */
function skipVideo(video: HTMLVideoElement, seconds: number, duration: number): void {
  video.currentTime = Math.max(0, Math.min(duration || Infinity, video.currentTime + seconds));
}

function toggleVideo(video: HTMLVideoElement): void {
  if (video.paused) void video.play().catch(() => undefined);
  else video.pause();
}

/** Control compacto del video en el encabezado: se usa aunque la página esté abajo, en la línea de tiempo. */
export function HeaderPlayer({ video }: { video: HTMLVideoElement | null }) {
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    if (!video) return;
    const sync = () => {
      setPlaying(!video.paused && !video.ended);
      setTime(video.currentTime);
      // Los WebM de Playwright a veces no traen duración hasta cargar: Infinity/NaN se ignoran.
      setDuration(Number.isFinite(video.duration) ? video.duration : 0);
    };
    sync();
    const events = ['play', 'pause', 'ended', 'timeupdate', 'durationchange', 'loadedmetadata', 'seeked'] as const;
    for (const name of events) video.addEventListener(name, sync);
    return () => {
      for (const name of events) video.removeEventListener(name, sync);
    };
  }, [video]);

  const disabled = !video;
  const skip = (seconds: number) => {
    if (video) skipVideo(video, seconds, duration);
  };
  const toggle = () => {
    if (video) toggleVideo(video);
  };

  return (
    <div className={styles.player} role="group" aria-label="Control del video">
      <button type="button" className={styles.button} onClick={() => skip(-SKIP_SECONDS)} disabled={disabled} title="Retroceder 5 s" aria-label="Retroceder 5 segundos">
        <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
          <path d="M9 5L4 10l5 5M16 5l-5 5 5 5" />
        </svg>
      </button>
      <button
        type="button"
        className={styles.play}
        onClick={toggle}
        disabled={disabled}
        aria-label={playing ? 'Pausar video' : 'Reproducir video'}
        title={playing ? 'Pausar' : 'Reproducir'}
      >
        {playing ? (
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
            <rect x="2" y="1.5" width="3" height="9" fill="currentColor" />
            <rect x="7" y="1.5" width="3" height="9" fill="currentColor" />
          </svg>
        ) : (
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
            <path d="M3 1.5v9l7.5-4.5z" fill="currentColor" />
          </svg>
        )}
      </button>
      <button type="button" className={styles.button} onClick={() => skip(SKIP_SECONDS)} disabled={disabled} title="Avanzar 5 s" aria-label="Avanzar 5 segundos">
        <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
          <path d="M11 5l5 5-5 5M4 5l5 5-5 5" />
        </svg>
      </button>
      <span className={styles.time}>
        {formatClock(time * 1000, false)}
        {duration > 0 && <span className={styles.duration}> / {formatClock(duration * 1000, false)}</span>}
      </span>
    </div>
  );
}
