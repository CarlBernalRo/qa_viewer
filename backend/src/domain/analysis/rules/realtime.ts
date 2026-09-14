import { decodeWsPayload } from '@rastro/shared';
import type { SessionEvidence, SocketTrace } from '../evidence.js';
import { describeMessages, groupBy, times, type FindingDraft, type Rule } from '../rule.js';

const socketEndpoint = (evidence: SessionEvidence, socket: SocketTrace) =>
  socket.open ? evidence.endpoint('WS', socket.open.url) : 'WS (sin URL)';

export const wsProtocolError: Rule = {
  id: 'ws-protocol-error',
  run(evidence) {
    const hits = evidence.sockets.flatMap((socket) =>
      socket.frames.flatMap((frame) => {
        const decoded = decodeWsPayload(frame.payload);
        return decoded.isError ? [{ frame, decoded, endpoint: socketEndpoint(evidence, socket), url: socket.open?.url }] : [];
      }),
    );
    return [...groupBy(hits, (hit) => `${hit.endpoint}|${hit.decoded.label}`)].flatMap(([key, group]): FindingDraft[] => {
      const [first] = group;
      if (!first) return [];
      return [
        {
          severity: 'high',
          key,
          title: first.decoded.label,
          subject: first.endpoint,
          detail: `${first.frame.direction === 'received' ? 'Llegó' : 'Se envió'} ${times(group.length)} por ${first.endpoint}.${describeMessages(first.decoded.json)}`,
          recommendation:
            first.decoded.protocol === 'socket.io'
              ? 'El servidor rechazó la conexión del socket. Suele ser un token vencido o inválido en el handshake; el mensaje completo está en la conversación del inspector.'
              : 'Abre la conversación del socket en el inspector para ver qué mensaje provocó el error.',
          evidence: group.map((hit) => hit.frame),
          urls: group.flatMap((hit) => (hit.url ? [hit.url] : [])),
        },
      ];
    });
  },
};

const RECONNECT_MIN = 3;

export const wsReconnectLoop: Rule = {
  id: 'ws-reconnect-loop',
  run(evidence) {
    const opened = evidence.sockets.filter((socket) => socket.open);
    return [...groupBy(opened, (socket) => socketEndpoint(evidence, socket))].flatMap(
      ([endpoint, sockets]): FindingDraft[] => {
        if (sockets.length < RECONNECT_MIN) return [];
        const closes = sockets.filter((socket) => socket.close).length;
        const events = sockets.flatMap((socket) => (socket.open ? [socket.open] : []));
        return [
          {
            severity: 'medium',
            key: endpoint,
            title: `El socket ${endpoint.replace(/^WS /, '')} se abrió ${sockets.length} veces`,
            subject: endpoint,
            detail:
              closes > 0
                ? `Se cerró ${times(closes)} durante la sesión: la conexión no se mantiene.`
                : 'Ninguna se cerró: puede haber conexiones duplicadas abiertas a la vez.',
            recommendation:
              'Revisa si el servidor corta la conexión (autenticación, timeout, proxy) y si el cliente reintenta sin esperar entre intentos.',
            evidence: events,
            urls: events.map((event) => event.url),
          },
        ];
      },
    );
  },
};

export const REALTIME_RULES: readonly Rule[] = [wsProtocolError, wsReconnectLoop];
