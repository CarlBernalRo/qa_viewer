import type { LiveMessage } from '@rastro/shared';
import type { WebSocket } from 'ws';
import type { LiveNotifier, Logger } from '../../domain/ports.js';

/** Difunde los mensajes en vivo (estado y estadísticas) a los clientes conectados por WebSocket. */
export class LiveHub implements LiveNotifier {
  private readonly clients = new Set<WebSocket>();

  constructor(private readonly logger: Logger) {}

  get size(): number {
    return this.clients.size;
  }

  add(socket: WebSocket): void {
    this.clients.add(socket);
    socket.on('close', () => this.clients.delete(socket));
    socket.on('error', (error) => {
      this.logger.debug('Error en un cliente en vivo', { error: String(error) });
      this.clients.delete(socket);
    });
  }

  publish(message: LiveMessage): void {
    const data = JSON.stringify(message);
    for (const socket of this.clients) {
      if (socket.readyState === socket.OPEN) socket.send(data);
    }
  }

  closeAll(): void {
    for (const socket of this.clients) socket.close(1001, 'El backend se está cerrando');
    this.clients.clear();
  }
}
