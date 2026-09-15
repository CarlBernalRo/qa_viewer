import { useCallback, useEffect, useRef, type ReactNode } from 'react';
import styles from './SessionDetail.module.css';

export interface SeekRequest {
  /** Momento de la sesión (no del video) al que saltar. */
  ms: number;
  /** Cambia en cada pedido, para poder saltar dos veces al mismo punto. */
  nonce: number;
}

interface VideoPlayerProps {
  src: string;
  /** Cuánto después del inicio de la sesión empezó el video. */
  offsetMs: number;
  seekRequest: SeekRequest | null;
  /** Momento de la sesión que se está viendo. */
  onTimeChange: (sessionMs: number) => void;
  /** Entrega el elemento <video> para controlarlo desde otro lado (p. ej., el encabezado). */
  onElement?: (video: HTMLVideoElement | null) => void;
  /** Capas sobre el video (p. ej., los recuadros). Ocupan exactamente el área del <video>. */
  children?: ReactNode;
}

export function VideoPlayer({ src, offsetMs, seekRequest, onTimeChange, onElement, children }: VideoPlayerProps) {
  const ref = useRef<HTMLVideoElement | null>(null);
  const setRef = useCallback(
    (video: HTMLVideoElement | null) => {
      ref.current = video;
      onElement?.(video);
    },
    [onElement],
  );

  useEffect(() => {
    if (seekRequest && ref.current) ref.current.currentTime = Math.max(0, (seekRequest.ms - offsetMs) / 1000);
  }, [seekRequest, offsetMs]);

  return (
    <div className={styles.player}>
      <video
        ref={setRef}
        className={styles.video}
        src={src}
        controls
        preload="metadata"
        onTimeUpdate={(event) => onTimeChange(event.currentTarget.currentTime * 1000 + offsetMs)}
        onSeeked={(event) => onTimeChange(event.currentTarget.currentTime * 1000 + offsetMs)}
      >
        Tu sistema no puede reproducir video WebM.
      </video>
      {children}
    </div>
  );
}
