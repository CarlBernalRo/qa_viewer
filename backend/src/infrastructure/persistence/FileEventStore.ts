import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { CaptureEvent } from '@rastro/shared';
import type { EventQuery, EventStore, Logger } from '../../domain/ports.js';
import { isNotFound } from './fs-utils.js';
import type { SessionPaths } from './SessionPaths.js';

interface Queue {
  buffer: string[];
  chain: Promise<void>;
  timer: NodeJS.Timeout | null;
}

const FLUSH_DELAY_MS = 50;

/** Guarda los eventos como NDJSON: una línea por evento, en el orden en que llegaron. */
export class FileEventStore implements EventStore {
  private readonly queues = new Map<string, Queue>();

  constructor(
    private readonly paths: SessionPaths,
    private readonly logger: Logger,
  ) {}

  append(sessionId: string, event: CaptureEvent): void {
    const queue = this.queue(sessionId);
    queue.buffer.push(JSON.stringify(event));
    queue.timer ??= setTimeout(() => void this.drain(sessionId), FLUSH_DELAY_MS);
  }

  async flush(sessionId: string): Promise<void> {
    await this.drain(sessionId);
    this.queues.delete(sessionId);
  }

  async read(sessionId: string, query: EventQuery = {}): Promise<CaptureEvent[]> {
    let raw: string;
    try {
      raw = await readFile(this.paths.eventsFile(sessionId), 'utf8');
    } catch (error) {
      if (isNotFound(error)) return [];
      throw error;
    }
    const kinds = query.kinds ? new Set(query.kinds) : null;
    const events: CaptureEvent[] = [];
    for (const line of raw.split('\n')) {
      if (!line) continue;
      const event = JSON.parse(line) as CaptureEvent;
      if (kinds && !kinds.has(event.kind)) continue;
      if (query.fromT !== undefined && event.t < query.fromT) continue;
      events.push(event);
      if (query.limit !== undefined && events.length >= query.limit) break;
    }
    return events;
  }

  private queue(sessionId: string): Queue {
    let queue = this.queues.get(sessionId);
    if (!queue) {
      queue = { buffer: [], chain: Promise.resolve(), timer: null };
      this.queues.set(sessionId, queue);
    }
    return queue;
  }

  private drain(sessionId: string): Promise<void> {
    const queue = this.queues.get(sessionId);
    if (!queue) return Promise.resolve();
    if (queue.timer) {
      clearTimeout(queue.timer);
      queue.timer = null;
    }
    if (queue.buffer.length === 0) return queue.chain;
    const chunk = `${queue.buffer.join('\n')}\n`;
    queue.buffer = [];
    const file = this.paths.eventsFile(sessionId);
    queue.chain = queue.chain
      .then(async () => {
        await mkdir(dirname(file), { recursive: true });
        await appendFile(file, chunk, 'utf8');
      })
      .catch((error: unknown) => {
        this.logger.error('No se pudieron guardar eventos', { sessionId, error: String(error) });
      });
    return queue.chain;
  }
}
