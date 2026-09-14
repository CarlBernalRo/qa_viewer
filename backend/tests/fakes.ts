import { emptyReview, type CaptureEvent, type FindingDecisionRecord, type LiveMessage, type SessionReview } from '@rastro/shared';
import { RecordingRegistry, type AppDeps } from '../src/application/index.js';
import type {
  BrowserRecorder,
  Clock,
  EventQuery,
  EventStore,
  FileOpener,
  FindingDecisionStore,
  IdGenerator,
  LiveNotifier,
  Logger,
  MediaStore,
  RecordingHandle,
  RecordingResult,
  RecordingSink,
  ReportRenderer,
  ReportStore,
  SessionReportData,
  SessionRepository,
  SessionReviewStore,
  StartRecordingOptions,
} from '../src/domain/ports.js';
import { Session } from '../src/domain/session/Session.js';

export class InMemorySessionRepository implements SessionRepository {
  readonly store = new Map<string, ReturnType<Session['toDto']>>();

  async save(session: Session): Promise<void> {
    this.store.set(session.id, session.toDto());
  }

  async findById(id: string): Promise<Session | null> {
    const dto = this.store.get(id);
    return dto ? Session.fromDto(dto) : null;
  }

  async list(): Promise<Session[]> {
    return [...this.store.values()].map((dto) => Session.fromDto(dto));
  }

  async delete(id: string): Promise<void> {
    this.store.delete(id);
  }
}

export class InMemoryEventStore implements EventStore {
  readonly events = new Map<string, CaptureEvent[]>();

  append(sessionId: string, event: CaptureEvent): void {
    const list = this.events.get(sessionId) ?? [];
    list.push(event);
    this.events.set(sessionId, list);
  }

  async flush(): Promise<void> {}

  async read(sessionId: string, query: EventQuery = {}): Promise<CaptureEvent[]> {
    return (this.events.get(sessionId) ?? []).filter((event) => !query.kinds || query.kinds.includes(event.kind));
  }
}

export class FakeMediaStore implements MediaStore {
  readonly videos = new Set<string>();
  failImport: Error | null = null;

  async prepareVideoDir(sessionId: string): Promise<string> {
    return `/tmp/${sessionId}`;
  }

  async importVideo(sessionId: string, sourcePath: string | undefined): Promise<boolean> {
    if (this.failImport) throw this.failImport;
    if (sourcePath) this.videos.add(sessionId);
    return Boolean(sourcePath);
  }

  async videoPath(sessionId: string): Promise<string | null> {
    return this.videos.has(sessionId) ? `/videos/${sessionId}.webm` : null;
  }
}

export class InMemoryFindingDecisionStore implements FindingDecisionStore {
  readonly byId = new Map<string, Record<string, FindingDecisionRecord>>();

  async read(sessionId: string): Promise<Record<string, FindingDecisionRecord>> {
    return { ...(this.byId.get(sessionId) ?? {}) };
  }

  async set(sessionId: string, findingId: string, record: FindingDecisionRecord | null): Promise<void> {
    const decisions = { ...(this.byId.get(sessionId) ?? {}) };
    if (record) decisions[findingId] = record;
    else delete decisions[findingId];
    this.byId.set(sessionId, decisions);
  }
}

export class InMemorySessionReviewStore implements SessionReviewStore {
  readonly byId = new Map<string, SessionReview>();

  async read(sessionId: string): Promise<SessionReview> {
    return structuredClone(this.byId.get(sessionId) ?? emptyReview());
  }

  async update(sessionId: string, change: (review: SessionReview) => SessionReview): Promise<SessionReview> {
    const updated = change(await this.read(sessionId));
    this.byId.set(sessionId, updated);
    return structuredClone(updated);
  }
}

export class FakeReportRenderer implements ReportRenderer {
  readonly rendered: SessionReportData[] = [];

  async renderPdf(report: SessionReportData): Promise<Uint8Array> {
    this.rendered.push(report);
    return new TextEncoder().encode('%PDF-falso');
  }
}

export class InMemoryReportStore implements ReportStore {
  readonly files = new Map<string, Uint8Array>();

  async save(fileName: string, content: Uint8Array): Promise<string> {
    this.files.set(fileName, content);
    return `/informes/${fileName}`;
  }

  async find(fileName: string): Promise<string | null> {
    return this.files.has(fileName) ? `/informes/${fileName}` : null;
  }
}

export class RecordingFileOpener implements FileOpener {
  readonly calls: Array<{ action: 'open' | 'reveal'; path: string }> = [];

  async open(path: string): Promise<void> {
    this.calls.push({ action: 'open', path });
  }

  async reveal(path: string): Promise<void> {
    this.calls.push({ action: 'reveal', path });
  }
}

export class ManualClock implements Clock {
  private current = new Date('2026-09-14T10:00:00.000Z').getTime();

  now(): Date {
    return new Date(this.current);
  }

  advance(ms: number): void {
    this.current += ms;
  }
}

export class SequentialIds implements IdGenerator {
  private sessions = 0;
  private events = 0;

  sessionId(): string {
    this.sessions += 1;
    return `ses_00000000-0000-4000-8000-${String(this.sessions).padStart(12, '0')}`;
  }

  eventId(): string {
    this.events += 1;
    return `e${this.events}`;
  }
}

export class CollectingNotifier implements LiveNotifier {
  readonly messages: LiveMessage[] = [];

  publish(message: LiveMessage): void {
    this.messages.push(message);
  }
}

export const silentLogger: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

/** Grabador falso: el test decide qué eventos llegan y cómo termina la grabación. */
export class FakeRecorder implements BrowserRecorder {
  sink: RecordingSink | null = null;
  lastOptions: StartRecordingOptions | null = null;
  failWith: Error | null = null;
  videoOnStop: string | undefined = '/tmp/video.webm';
  /** Si no es null, simula que el video empieza este tiempo después de iniciar la sesión. */
  videoStartDelayMs: number | null = null;
  clock: ManualClock | null = null;

  async start(options: StartRecordingOptions, sink: RecordingSink): Promise<RecordingHandle> {
    if (this.failWith) throw this.failWith;
    this.sink = sink;
    this.lastOptions = options;
    if (this.videoStartDelayMs !== null) {
      this.clock?.advance(this.videoStartDelayMs);
      sink.onVideoStarted();
    }
    return {
      stop: async () => {
        this.end({ reason: 'stopped', ...(this.videoOnStop ? { videoFile: this.videoOnStop } : {}) });
      },
    };
  }

  end(result: RecordingResult): void {
    this.sink?.onEnded(result);
  }
}

export function createTestDeps(maxConcurrent = 1) {
  const deps = {
    sessions: new InMemorySessionRepository(),
    events: new InMemoryEventStore(),
    media: new FakeMediaStore(),
    decisions: new InMemoryFindingDecisionStore(),
    reviews: new InMemorySessionReviewStore(),
    renderer: new FakeReportRenderer(),
    reportStore: new InMemoryReportStore(),
    opener: new RecordingFileOpener(),
    clock: new ManualClock(),
    ids: new SequentialIds(),
    notifier: new CollectingNotifier(),
    logger: silentLogger,
    registry: new RecordingRegistry(maxConcurrent),
    recorder: new FakeRecorder(),
  };
  deps.recorder.clock = deps.clock;
  return deps satisfies AppDeps;
}
