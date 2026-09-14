import { liveMessageSchema } from '@rastro/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { queryKeys } from '../shared/api/queryKeys';
import { useApi } from './providers/BackendProvider';

const RECONNECT_MS = 1500;
const SERVER_STATE_ROOTS = new Set(['sessions', 'session', 'session-events']);

/**
 * Escucha los mensajes en vivo del backend y los vuelca en la caché de React Query,
 * así cualquier pantalla ve el estado y los contadores sin pedirlos. También publica
 * si la conexión está viva, para avisar al usuario cuando se pierde.
 */
export function LiveBridge() {
  const api = useApi();
  const queryClient = useQueryClient();

  useEffect(() => {
    let socket: WebSocket | null = null;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let closed = false;

    const refreshServerState = () =>
      queryClient.invalidateQueries({
        predicate: (query) => SERVER_STATE_ROOTS.has(String(query.queryKey[0])),
      });

    const connect = () => {
      socket = new WebSocket(api.liveUrl());
      socket.onopen = () => {
        const wasDown = queryClient.getQueryData(queryKeys.liveConnection) === false;
        queryClient.setQueryData(queryKeys.liveConnection, true);
        // Al volver la conexión, lo que se muestra puede estar desactualizado.
        if (wasDown) void refreshServerState();
      };
      socket.onmessage = (event: MessageEvent<string>) => {
        let data: unknown;
        try {
          data = JSON.parse(event.data);
        } catch {
          return;
        }
        const parsed = liveMessageSchema.safeParse(data);
        if (!parsed.success) return;
        const message = parsed.data;
        if (message.type === 'session-stats') {
          queryClient.setQueryData(queryKeys.liveStats(message.sessionId), {
            elapsedMs: message.elapsedMs,
            stats: message.stats,
          });
        } else {
          void queryClient.invalidateQueries({ queryKey: queryKeys.sessions });
          void queryClient.invalidateQueries({ queryKey: queryKeys.session(message.sessionId) });
          void queryClient.invalidateQueries({ queryKey: queryKeys.sessionEvents(message.sessionId) });
        }
      };
      socket.onclose = () => {
        if (closed) return;
        queryClient.setQueryData(queryKeys.liveConnection, false);
        retry = setTimeout(connect, RECONNECT_MS);
      };
    };

    connect();
    return () => {
      closed = true;
      if (retry) clearTimeout(retry);
      socket?.close();
    };
  }, [api, queryClient]);

  return null;
}
