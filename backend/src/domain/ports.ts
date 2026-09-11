import type { CaptureConfig, CaptureEvent, CaptureEventKind, LiveMessage, RawCaptureEvent } from '@rastro/shared';
import type { Session } from './session/Session.js';

/** Puertos: contratos que la infraestructura implementa. El dominio y la aplicación solo conocen esto. */

export interface SessionRepository {
  save(session: Session): Promise<void>;
  findById(id: string): Promise<Session | null>;
  list(): Promise<Session[]>;
}

export interface EventQuery {
  kinds?: readonly CaptureEventKind[];
  fromT?: number;
  limit?: number;
}

export interface EventStore {
  /** Encola el evento; la escritura a disco es asíncrona y ordenada. */
  append(sessionId: string, event: CaptureEvent): void;
  flush(sessionId: string): Promise<void>;
  read(sessionId: string, query?: EventQuery): Promise<CaptureEvent[]>;
}

export interface MediaStore {
  /** Carpeta temporal donde el grabador deja el video mientras graba. */
  prepareVideoDir(sessionId: string): Promise<string>;
  /** Mueve el video final a su lugar definitivo. Devuelve false si no había video. */
  importVideo(sessionId: string, sourcePath: string | undefined): Promise<boolean>;
  videoPath(sessionId: string): Promise<string | null>;
}

export type RecordingEndReason = 'stopped' | 'browser-closed' | 'crashed';

export interface RecordingResult {
  reason: RecordingEndReason;
  videoFile?: string;
  error?: string;
}

export interface RecordingSink {
  onEvent(event: RawCaptureEvent): void;
  /** Se llama exactamente una vez, cuando la grabación terminó por cualquier motivo. */
  onEnded(result: RecordingResult): void;
}

export interface RecordingHandle {
  /** Pide detener la grabación; resuelve cuando `onEnded` ya se ejecutó. */
  stop(): Promise<void>;
}

export interface StartRecordingOptions {
  sessionId: string;
  config: CaptureConfig;
  videoDir: string;
}

export interface BrowserRecorder {
  start(options: StartRecordingOptions, sink: RecordingSink): Promise<RecordingHandle>;
}

export interface Clock {
  now(): Date;
}

export interface IdGenerator {
  sessionId(): string;
  eventId(): string;
}

export interface LiveNotifier {
  publish(message: LiveMessage): void;
}

export interface Logger {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}
