export type WsProtocol = 'socket.io' | 'engine.io' | 'json' | 'sip' | 'text' | 'binary';

export interface DecodedWsMessage {
  protocol: WsProtocol;
  /** Resumen legible de una línea, p. ej. «Socket.IO · evento "order.status"». */
  label: string;
  isError: boolean;
  /** Datos JSON del mensaje, si los hay. */
  json?: unknown;
}

const ENGINE_TYPES: Record<string, string> = {
  '0': 'conexión abierta',
  '1': 'cierre',
  '2': 'ping',
  '3': 'pong',
  '5': 'upgrade',
  '6': 'noop',
};

const SOCKET_TYPES: Record<string, string> = {
  '0': 'conectar',
  '1': 'desconectar',
  '2': 'evento',
  '3': 'respuesta (ack)',
  '4': 'error de conexión',
  '5': 'evento binario',
  '6': 'respuesta binaria',
};

/** Respuestas SIP que son parte normal del handshake (desafío de autenticación), no errores. */
const SIP_CHALLENGES = new Set([401, 407]);

function tryJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

const looksJson = (text: string) => /^\s*[[{"]/.test(text);

function summarizeJson(value: unknown): string {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    for (const key of ['type', 'event', 'action', 'op', 'method']) {
      if (typeof record[key] === 'string') return `${key}: ${record[key]}`;
    }
  }
  return JSON.stringify(value).slice(0, 80);
}

function decodeEngineIo(payload: string): DecodedWsMessage | null {
  const type = payload[0];
  if (type === undefined || !/[0-6]/.test(type)) return null;
  const rest = payload.slice(1);

  if (type !== '4') {
    if (rest !== '' && rest !== 'probe' && !looksJson(rest)) return null;
    const json = rest && rest !== 'probe' ? tryJson(rest) : undefined;
    return {
      protocol: 'engine.io',
      label: `Engine.IO · ${ENGINE_TYPES[type] ?? type}`,
      isError: false,
      ...(json !== undefined ? { json } : {}),
    };
  }

  // Engine.IO "message" que transporta un paquete Socket.IO: tipo, namespace, id de ack y datos.
  const packet = /^([0-6])(\/[^,]*,)?(\d*)([\s\S]*)$/.exec(rest);
  if (!packet) return null;
  const [, socketType = '', namespace, , body = ''] = packet;
  if (body !== '' && !looksJson(body)) return null;
  const data = body ? tryJson(body) : undefined;
  let label: string;
  if (socketType === '2' || socketType === '5') {
    const name = Array.isArray(data) && typeof data[0] === 'string' ? data[0] : 'sin nombre';
    label = `Socket.IO · evento "${name}"`;
  } else {
    label = `Socket.IO · ${SOCKET_TYPES[socketType] ?? socketType}`;
  }
  if (namespace) label += ` en ${namespace.slice(0, -1)}`;
  const isError = socketType === '4';
  if (isError && data && typeof data === 'object' && typeof (data as { message?: unknown }).message === 'string') {
    label += `: ${(data as { message: string }).message}`;
  }
  return { protocol: 'socket.io', label, isError, ...(data !== undefined ? { json: data } : {}) };
}

/** Traduce un frame de WebSocket a algo legible: Socket.IO, Engine.IO, SIP, JSON o texto. */
export function decodeWsPayload(payload: string): DecodedWsMessage {
  if (payload.startsWith('[binario')) return { protocol: 'binary', label: payload, isError: false };

  const sipResponse = /^SIP\/2\.0 (\d{3})([^\r\n]*)/.exec(payload);
  if (sipResponse) {
    const status = Number(sipResponse[1]);
    return {
      protocol: 'sip',
      label: `SIP ${status}${sipResponse[2] ?? ''}`,
      isError: status >= 400 && !SIP_CHALLENGES.has(status),
    };
  }
  const sipRequest = /^([A-Z]+) sip:\S+ SIP\/2\.0/.exec(payload);
  if (sipRequest) return { protocol: 'sip', label: `SIP ${sipRequest[1]}`, isError: false };

  const engine = decodeEngineIo(payload);
  if (engine) return engine;

  const json = tryJson(payload);
  if (json !== undefined && typeof json === 'object') {
    return { protocol: 'json', label: summarizeJson(json), isError: false, json };
  }
  return { protocol: 'text', label: payload.slice(0, 80).replace(/\s+/g, ' '), isError: false };
}
