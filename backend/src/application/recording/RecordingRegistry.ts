import { LimitReachedError } from '../../domain/errors.js';
import type { RecordingHandle } from '../../domain/ports.js';

interface ActiveEntry {
  handle: RecordingHandle;
  /** Resuelve cuando la sesión quedó finalizada y guardada. */
  done: Promise<void>;
}

/** Grabaciones activas en este proceso. */
export class RecordingRegistry {
  private readonly active = new Map<string, ActiveEntry>();

  constructor(private readonly maxConcurrent: number) {}

  get size(): number {
    return this.active.size;
  }

  has(sessionId: string): boolean {
    return this.active.has(sessionId);
  }

  get(sessionId: string): ActiveEntry | undefined {
    return this.active.get(sessionId);
  }

  assertCapacity(): void {
    if (this.active.size >= this.maxConcurrent) {
      throw new LimitReachedError(
        `Ya hay ${this.active.size} grabación(es) activa(s); el máximo es ${this.maxConcurrent}. Detén una antes de empezar otra.`,
      );
    }
  }

  add(sessionId: string, entry: ActiveEntry): void {
    this.active.set(sessionId, entry);
  }

  remove(sessionId: string): void {
    this.active.delete(sessionId);
  }

  async stopAll(): Promise<void> {
    const entries = [...this.active.values()];
    await Promise.allSettled(entries.map(async (entry) => {
      await entry.handle.stop();
      await entry.done;
    }));
  }
}
