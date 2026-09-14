import { decodeWsPayload } from '@rastro/shared';
import { useState } from 'react';
import { cx } from '../../../shared/lib/cx';
import { formatClock } from '../../../shared/lib/format';
import { BodyView } from '../../../shared/ui';
import type { SocketRecord } from '../timeline/buildTimeline';
import styles from './WebSocketConversation.module.css';

interface WebSocketConversationProps {
  socket: SocketRecord | undefined;
  /** Frame a resaltar y abrir (el que se eligió en la línea de tiempo). */
  selectedFrameId?: string;
}

/** Todos los mensajes de una conexión WebSocket, en orden, como una conversación. */
export function WebSocketConversation({ socket, selectedFrameId }: WebSocketConversationProps) {
  const [openId, setOpenId] = useState<string | undefined>(selectedFrameId);
  const [lastSelected, setLastSelected] = useState(selectedFrameId);
  if (selectedFrameId !== lastSelected) {
    setLastSelected(selectedFrameId);
    setOpenId(selectedFrameId);
  }

  if (!socket) return <p className={styles.muted}>No se encontró la conexión de este mensaje.</p>;
  const sent = socket.frames.filter((frame) => frame.direction === 'sent').length;

  return (
    <div className={styles.conversation}>
      <div className={styles.header}>
        <span className="mono">{socket.url ?? 'Conexión sin URL registrada'}</span>
        <span className={styles.meta}>
          {socket.frames.length} mensajes · {sent} enviados · {socket.frames.length - sent} recibidos
          {socket.openedAt !== undefined && ` · abierta en ${formatClock(socket.openedAt)}`}
          {socket.closedAt !== undefined && ` · cerrada en ${formatClock(socket.closedAt)}`}
        </span>
      </div>
      {socket.frames.length === 0 ? (
        <p className={styles.muted}>Esta conexión no envió ni recibió mensajes.</p>
      ) : (
        <ol className={styles.list}>
          {socket.frames.map((frame) => {
            const decoded = decodeWsPayload(frame.payload);
            const open = openId === frame.id;
            return (
              <li key={frame.id} className={cx(styles.message, frame.id === selectedFrameId && styles.selected)}>
                <button
                  type="button"
                  className={styles.summary}
                  aria-expanded={open}
                  onClick={() => setOpenId(open ? undefined : frame.id)}
                >
                  <span className={cx(styles.direction, frame.direction === 'sent' ? styles.sent : styles.received)}>
                    {frame.direction === 'sent' ? '↑' : '↓'}
                  </span>
                  <span className={styles.time}>{formatClock(frame.t)}</span>
                  <span className={cx(styles.label, decoded.isError && styles.error)}>{decoded.label}</span>
                </button>
                {open && (
                  <div className={styles.detail}>
                    {decoded.json !== undefined ? (
                      <BodyView title="Datos" content={JSON.stringify(decoded.json)} />
                    ) : (
                      <BodyView title="Mensaje" content={frame.payload} />
                    )}
                    {decoded.json !== undefined && (
                      <span className={styles.raw} title={frame.payload}>
                        Original: {frame.payload.slice(0, 120)}
                        {frame.payload.length > 120 ? '…' : ''}
                      </span>
                    )}
                    {frame.truncated && <span className={styles.muted}>El mensaje se guardó recortado.</span>}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
