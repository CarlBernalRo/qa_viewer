import { useEffect, useState } from 'react';
import { cx } from '../../../shared/lib/cx';
import { InfoTip, SegmentedControl } from '../../../shared/ui';
import { projectRect, type OverlayBox, type Size } from './overlays';
import styles from './VideoOverlay.module.css';

export type OverlayMode = 'always' | 'paused' | 'never';

interface Geometry {
  element: Size;
  video: Size;
}

interface VideoOverlayProps {
  video: HTMLVideoElement | null;
  boxes: readonly OverlayBox[];
  mode: OverlayMode;
  selectedEventId: string | null;
  onSelect: (eventId: string) => void;
}

/** Recuadros sobre el video: se reubican solos si cambia el tamaño del reproductor. */
export function VideoOverlay({ video, boxes, mode, selectedEventId, onSelect }: VideoOverlayProps) {
  const [geometry, setGeometry] = useState<Geometry | null>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (!video) return;
    const measure = () =>
      setGeometry({
        element: { w: video.clientWidth, h: video.clientHeight },
        video: { w: video.videoWidth, h: video.videoHeight },
      });
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    // ResizeObserver avisa apenas empieza a observar y en cada cambio de tamaño.
    const observer = new ResizeObserver(measure);
    observer.observe(video);
    video.addEventListener('loadedmetadata', measure);
    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('ended', onPause);
    return () => {
      observer.disconnect();
      video.removeEventListener('loadedmetadata', measure);
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('ended', onPause);
    };
  }, [video]);

  if (!video || !geometry || mode === 'never' || (mode === 'paused' && playing)) return null;
  const visible = boxes.flatMap((box) => {
    const position = projectRect(box.rect, box.viewport, geometry.video, geometry.element);
    return position ? [{ box, position }] : [];
  });
  if (visible.length === 0) return null;

  return (
    <div className={styles.layer}>
      {visible.map(({ box, position }) => (
        <button
          key={box.id}
          type="button"
          title={box.label}
          aria-label={`Ver detalle: ${box.label}`}
          className={cx(
            styles.box,
            styles[box.tone],
            box.eventId === selectedEventId && styles.selected,
            position.top < 20 && styles.labelBelow,
          )}
          style={{ left: position.left, top: position.top, width: position.width, height: position.height }}
          onClick={() => onSelect(box.eventId)}
        >
          <span className={styles.label}>{box.label}</span>
        </button>
      ))}
    </div>
  );
}

const MODE_OPTIONS = [
  { value: 'always', label: 'Siempre' },
  { value: 'paused', label: 'Al pausar' },
  { value: 'never', label: 'Nunca' },
] as const;

export function OverlayModeControl({ value, onChange }: { value: OverlayMode; onChange: (mode: OverlayMode) => void }) {
  return (
    <div className={styles.modeControl}>
      <span className={styles.modeLabel}>Recuadros</span>
      <SegmentedControl<OverlayMode> ariaLabel="Recuadros sobre el video" options={MODE_OPTIONS} value={value} onChange={onChange} />
      <InfoTip label="Qué son los recuadros">
        Marcan sobre el video el elemento donde hiciste clic o escribiste (azul) y los elementos con problemas de
        accesibilidad (rojo si es crítico, naranja si es grave, ámbar o gris si es menor). Haz clic en uno para ver su
        detalle.
      </InfoTip>
    </div>
  );
}
