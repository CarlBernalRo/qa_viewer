import { decodeWsPayload, type CaptureEvent, type CaptureEventOf } from '@rastro/shared';

export type LaneId = 'navigation' | 'actions' | 'network' | 'websocket' | 'console' | 'performance';
export type Severity = 'normal' | 'warn' | 'error';

export interface TimelineItem {
  id: string;
  /** Evento que se abre en el inspector (para la red, la request original). */
  eventId: string;
  lane: LaneId;
  start: number;
  /** Solo las requests tienen duración; el resto son puntos. */
  end: number | null;
  severity: Severity;
  label: string;
}

export interface TimelineLane {
  id: LaneId;
  label: string;
  color: string;
  items: TimelineItem[];
}

export interface RequestRecord {
  request?: CaptureEventOf<'http-request'>;
  response?: CaptureEventOf<'http-response'>;
  finished?: CaptureEventOf<'http-finished'>;
  failed?: CaptureEventOf<'http-failed'>;
}

/** Una conexión WebSocket con todos sus mensajes, para verla como conversación. */
export interface SocketRecord {
  requestId: string;
  url?: string;
  openedAt?: number;
  closedAt?: number;
  frames: CaptureEventOf<'ws-frame'>[];
}

export interface TimelineModel {
  durationMs: number;
  lanes: TimelineLane[];
  eventsById: Map<string, CaptureEvent>;
  requests: Map<string, RequestRecord>;
  sockets: Map<string, SocketRecord>;
}

const LANES: ReadonlyArray<Omit<TimelineLane, 'items'>> = [
  { id: 'navigation', label: 'PANTALLAS', color: 'var(--ch-navigation)' },
  { id: 'actions', label: 'ACCIONES UI', color: 'var(--ch-actions)' },
  { id: 'network', label: 'RED · REST', color: 'var(--ch-network)' },
  { id: 'websocket', label: 'WEBSOCKET', color: 'var(--ch-websocket)' },
  { id: 'console', label: 'CONSOLA', color: 'var(--ch-console)' },
  { id: 'performance', label: 'RENDIMIENTO', color: 'var(--ch-performance)' },
];

/** Umbrales "necesita mejorar" de Web Vitals; por encima se marcan en ámbar. */
const VITAL_LIMITS: Record<CaptureEventOf<'web-vital'>['name'], number> = {
  LCP: 2500,
  INP: 200,
  CLS: 0.1,
  'long-task': 200,
};

const ACTION_LABELS: Record<CaptureEventOf<'user-action'>['action'], string> = {
  click: 'Click en',
  input: 'Escribe en',
  change: 'Cambia',
  submit: 'Envía',
  keydown: 'Tecla en',
};

export function shortUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.pathname}${parsed.search ? '?…' : ''}`;
  } catch {
    return url;
  }
}

/** Convierte la lista de eventos en carriles listos para dibujar. */
export function buildTimeline(events: readonly CaptureEvent[]): TimelineModel {
  const lanes = new Map(LANES.map((lane) => [lane.id, { ...lane, items: [] as TimelineItem[] }]));
  const eventsById = new Map<string, CaptureEvent>();
  const requests = new Map<string, RequestRecord>();
  const sockets = new Map<string, SocketRecord>();
  const requestItems = new Map<string, TimelineItem>();
  let durationMs = 0;

  const push = (lane: LaneId, event: CaptureEvent, label: string, severity: Severity = 'normal') => {
    const item: TimelineItem = { id: event.id, eventId: event.id, lane, start: event.t, end: null, severity, label };
    lanes.get(lane)?.items.push(item);
    return item;
  };
  const requestFor = (requestId: string): RequestRecord => {
    let record = requests.get(requestId);
    if (!record) {
      record = {};
      requests.set(requestId, record);
    }
    return record;
  };
  const socketFor = (requestId: string): SocketRecord => {
    let record = sockets.get(requestId);
    if (!record) {
      record = { requestId, frames: [] };
      sockets.set(requestId, record);
    }
    return record;
  };

  for (const event of events) {
    eventsById.set(event.id, event);
    durationMs = Math.max(durationMs, event.t);
    switch (event.kind) {
      case 'navigation':
        push('navigation', event, shortUrl(event.url));
        break;
      case 'user-action':
        push('actions', event, `${ACTION_LABELS[event.action]} ${event.label?.trim() ? event.label : event.selector}`);
        break;
      case 'http-request': {
        requestFor(event.requestId).request = event;
        const item = push('network', event, `${event.method} ${shortUrl(event.url)}`);
        item.end = item.start;
        requestItems.set(event.requestId, item);
        break;
      }
      case 'http-response': {
        requestFor(event.requestId).response = event;
        const item = requestItems.get(event.requestId);
        if (item) {
          item.label += ` → ${event.status}`;
          if (event.status >= 500) item.severity = 'error';
          else if (event.status >= 400 && item.severity === 'normal') item.severity = 'warn';
        }
        break;
      }
      case 'http-finished': {
        requestFor(event.requestId).finished = event;
        const item = requestItems.get(event.requestId);
        if (item) {
          item.end = item.start + event.durationMs;
          durationMs = Math.max(durationMs, item.end);
        }
        break;
      }
      case 'http-failed': {
        requestFor(event.requestId).failed = event;
        const item = requestItems.get(event.requestId);
        if (item) {
          item.end = event.t;
          item.severity = event.canceled ? 'warn' : 'error';
          item.label += event.canceled ? ' (cancelada)' : ` ✕ ${event.errorText}`;
        }
        break;
      }
      case 'ws-open': {
        const socket = socketFor(event.requestId);
        socket.url = event.url;
        socket.openedAt = event.t;
        push('websocket', event, `Conexión ${shortUrl(event.url)}`);
        break;
      }
      case 'ws-frame': {
        socketFor(event.requestId).frames.push(event);
        const decoded = decodeWsPayload(event.payload);
        push(
          'websocket',
          event,
          `${event.direction === 'sent' ? '↑' : '↓'} ${decoded.label}`,
          decoded.isError ? 'error' : 'normal',
        );
        break;
      }
      case 'ws-close':
        socketFor(event.requestId).closedAt = event.t;
        push('websocket', event, 'Conexión cerrada');
        break;
      case 'sse-message':
        push('websocket', event, `SSE ${event.eventName}: ${event.data.slice(0, 60)}`);
        break;
      case 'console':
        push(
          'console',
          event,
          event.text.slice(0, 120),
          event.level === 'error' ? 'error' : event.level === 'warn' ? 'warn' : 'normal',
        );
        break;
      case 'exception':
        push('console', event, event.message.slice(0, 120), 'error');
        break;
      case 'web-vital':
        push(
          'performance',
          event,
          `${event.name} ${event.name === 'CLS' ? event.value : `${event.value} ms`}`,
          event.value > VITAL_LIMITS[event.name] ? 'warn' : 'normal',
        );
        break;
      case 'a11y-scan': {
        // Una revisión por pantalla: va en el carril de pantallas.
        const count = event.violations.length;
        const serious = event.violations.some((item) => item.impact === 'critical' || item.impact === 'serious');
        push(
          'navigation',
          event,
          count === 0 ? 'Accesibilidad: sin problemas' : `Accesibilidad: ${count} ${count === 1 ? 'problema' : 'problemas'}`,
          serious ? 'warn' : 'normal',
        );
        break;
      }
    }
  }

  return { durationMs: Math.max(durationMs, 1000), lanes: [...lanes.values()], eventsById, requests, sockets };
}
