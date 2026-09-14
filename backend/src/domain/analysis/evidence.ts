import type {
  CaptureConfig,
  CaptureEvent,
  CaptureEventKind,
  CaptureEventOf,
  Environment,
  Objective,
} from '@rastro/shared';
import { normalizedPath, safeUrl, siteOf } from './url.js';

/** Una request con todo lo que le pasó: respuesta, fin o falla. */
export interface RequestTrace {
  request: CaptureEventOf<'http-request'>;
  response?: CaptureEventOf<'http-response'>;
  finished?: CaptureEventOf<'http-finished'>;
  failed?: CaptureEventOf<'http-failed'>;
}

export interface SocketTrace {
  requestId: string;
  open?: CaptureEventOf<'ws-open'>;
  frames: CaptureEventOf<'ws-frame'>[];
  close?: CaptureEventOf<'ws-close'>;
}

export interface AnalysisInput {
  objective: Objective;
  capture: CaptureConfig;
  events: readonly CaptureEvent[];
}

/**
 * Índice de la sesión para las reglas: requests con su respuesta, sockets con sus
 * mensajes, eventos por tipo, y qué hosts son "el sitio" y cuáles son de terceros.
 */
export class SessionEvidence {
  readonly requests: RequestTrace[] = [];
  readonly sockets: SocketTrace[] = [];
  readonly actions: CaptureEventOf<'user-action'>[] = [];
  readonly pageIsHttps: boolean;
  private readonly byKind = new Map<CaptureEventKind, CaptureEvent[]>();
  private readonly sites = new Set<string>();
  private readonly startHost: string;

  constructor(private readonly input: AnalysisInput) {
    const openRequests = new Map<string, RequestTrace>();
    const sockets = new Map<string, SocketTrace>();
    const socketFor = (requestId: string): SocketTrace => {
      let socket = sockets.get(requestId);
      if (!socket) {
        socket = { requestId, frames: [] };
        sockets.set(requestId, socket);
      }
      return socket;
    };

    for (const event of [...input.events].sort((a, b) => a.t - b.t)) {
      const list = this.byKind.get(event.kind);
      if (list) list.push(event);
      else this.byKind.set(event.kind, [event]);

      switch (event.kind) {
        case 'http-request': {
          // Una redirección reutiliza el requestId: cada request nueva abre su propia traza.
          const trace: RequestTrace = { request: event };
          this.requests.push(trace);
          openRequests.set(event.requestId, trace);
          break;
        }
        case 'http-response': {
          const trace = openRequests.get(event.requestId);
          if (trace) trace.response = event;
          break;
        }
        case 'http-finished': {
          const trace = openRequests.get(event.requestId);
          if (trace) trace.finished = event;
          break;
        }
        case 'http-failed': {
          const trace = openRequests.get(event.requestId);
          if (trace) trace.failed = event;
          break;
        }
        case 'ws-open':
          socketFor(event.requestId).open = event;
          break;
        case 'ws-frame':
          socketFor(event.requestId).frames.push(event);
          break;
        case 'ws-close':
          socketFor(event.requestId).close = event;
          break;
        case 'user-action':
          this.actions.push(event);
          break;
        case 'navigation': {
          const url = safeUrl(event.url);
          if (url?.hostname) this.sites.add(siteOf(url.hostname));
          break;
        }
        default:
          break;
      }
    }

    this.sockets.push(...sockets.values());
    const start = safeUrl(input.capture.startUrl);
    this.startHost = start?.host ?? '';
    if (start) this.sites.add(siteOf(start.hostname));
    this.pageIsHttps = start?.protocol === 'https:';
  }

  get environment(): Environment {
    return this.input.capture.environment;
  }

  ofKind<K extends CaptureEventKind>(kind: K): CaptureEventOf<K>[] {
    return (this.byKind.get(kind) ?? []) as CaptureEventOf<K>[];
  }

  /** El host pertenece al sitio que se prueba (el de la URL inicial o una pantalla visitada). */
  isFirstParty(rawUrl: string): boolean {
    const url = safeUrl(rawUrl);
    return url ? this.sites.has(siteOf(url.hostname)) : false;
  }

  /** "POST /api/orders/:id". Si el host no es el de la URL inicial, se incluye para distinguirlo. */
  endpoint(method: string, rawUrl: string): string {
    const url = safeUrl(rawUrl);
    if (!url) return `${method} ${rawUrl}`;
    const host = url.host === this.startHost ? '' : url.host;
    return `${method} ${host}${normalizedPath(url)}`;
  }

  /** Última acción del usuario en los `windowMs` anteriores a `t` (o en el mismo instante). */
  actionBefore(t: number, windowMs = 3000): CaptureEventOf<'user-action'> | undefined {
    for (let index = this.actions.length - 1; index >= 0; index -= 1) {
      const action = this.actions[index];
      if (!action || action.t > t) continue;
      return t - action.t <= windowMs ? action : undefined;
    }
    return undefined;
  }
}
