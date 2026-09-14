import type { CaptureEvent } from '@rastro/shared';
import type { ReactNode } from 'react';
import { formatClock, formatDuration } from '../../shared/lib/format';
import { EVENT_KIND_LABELS } from '../../shared/lib/labels';
import { BodyView, CodeBlock, HeadersTable, Panel } from '../../shared/ui';
import { A11yScanDetail } from './a11y/A11yScanDetail';
import styles from './SessionDetail.module.css';
import type { TimelineModel } from './timeline/buildTimeline';
import { WebSocketConversation } from './websocket/WebSocketConversation';

function Rows({ rows }: { rows: Array<[string, ReactNode]> }) {
  return (
    <dl className={styles.rows}>
      {rows.map(([label, value]) => (
        <div key={label} className={styles.rowItem}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function statusTone(status: number): string {
  if (status >= 500) return styles.statusError ?? '';
  if (status >= 400) return styles.statusWarn ?? '';
  return styles.statusOk ?? '';
}

function Detail({ event, model }: { event: CaptureEvent; model: TimelineModel }) {
  switch (event.kind) {
    case 'http-request':
    case 'http-response':
    case 'http-finished':
    case 'http-failed': {
      const record = model.requests.get(event.requestId);
      const request = record?.request;
      const response = record?.response;
      return (
        <>
          <div className={styles.requestLine}>
            <span className={styles.method}>{request?.method ?? '—'}</span>
            <span className="mono">{request?.url ?? '—'}</span>
          </div>
          <Rows
            rows={[
              [
                'Status',
                response ? (
                  <span className={statusTone(response.status)}>
                    {response.status} {response.statusText}
                  </span>
                ) : record?.failed ? (
                  <span className={styles.statusError}>Falló: {record.failed.errorText}</span>
                ) : (
                  'Sin respuesta'
                ),
              ],
              ['Duración', record?.finished ? formatDuration(record.finished.durationMs) : '—'],
              ['Tipo', request?.resourceType ?? '—'],
              ['Contenido', response?.mimeType || '—'],
            ]}
          />
          {request?.postData && <BodyView title="Cuerpo enviado" content={request.postData} />}
          {response?.body && (
            <BodyView title={`Respuesta${response.bodyTruncated ? ' (recortada)' : ''}`} content={response.body} />
          )}
          {response && !response.body && (
            <p className={styles.muted}>No se guardó el cuerpo (imágenes, estilos y scripts no se guardan).</p>
          )}
          {request && <HeadersTable title="Headers de la request" headers={request.headers} />}
          {response && <HeadersTable title="Headers de la respuesta" headers={response.headers} />}
        </>
      );
    }
    case 'user-action':
      return (
        <Rows
          rows={[
            ['Acción', event.action],
            ['Elemento', event.label ?? '—'],
            ['Selector', <span className="mono">{event.selector}</span>],
            ...(event.value !== undefined ? [['Valor', event.value] as [string, ReactNode]] : []),
            ...(event.key ? [['Tecla', event.key] as [string, ReactNode]] : []),
            ...(event.rect
              ? [['Zona', `${event.rect.w}×${event.rect.h} en (${event.rect.x}, ${event.rect.y})`] as [string, ReactNode]]
              : []),
          ]}
        />
      );
    case 'navigation':
      return <Rows rows={[['URL', <span className="mono">{event.url}</span>]]} />;
    case 'console':
      return (
        <>
          <Rows rows={[['Nivel', event.level], ['Origen', event.source ?? '—']]} />
          <BodyView title="Mensaje" content={event.text} />
        </>
      );
    case 'exception':
      return (
        <>
          <p className={styles.exceptionMessage}>{event.message}</p>
          {event.stack && <CodeBlock content={event.stack} maxHeight={420} />}
        </>
      );
    case 'ws-open':
    case 'ws-close':
      return <WebSocketConversation socket={model.sockets.get(event.requestId)} />;
    case 'ws-frame':
      return <WebSocketConversation socket={model.sockets.get(event.requestId)} selectedFrameId={event.id} />;
    case 'sse-message':
      return (
        <>
          <Rows rows={[['Evento', event.eventName]]} />
          <BodyView title="Datos" content={event.data} />
        </>
      );
    case 'web-vital':
      return <Rows rows={[['Métrica', event.name], ['Valor', event.name === 'CLS' ? event.value : `${event.value} ms`]]} />;
    case 'a11y-scan':
      return <A11yScanDetail scan={event} />;
  }
}

/** Panel derecho: fijo y con su propio scroll. */
export function EventInspector({ event, model }: { event: CaptureEvent | null; model: TimelineModel }) {
  if (!event) {
    return (
      <Panel title="Detalle del evento" fill>
        <p className={styles.muted}>
          Selecciona un error de la lista o un punto de la línea de tiempo para ver su detalle y saltar a ese momento del
          video.
        </p>
      </Panel>
    );
  }
  return (
    <Panel title={EVENT_KIND_LABELS[event.kind]} subtitle={formatClock(event.t)} fill>
      <div className={styles.inspector}>
        <Detail event={event} model={model} />
      </div>
    </Panel>
  );
}
