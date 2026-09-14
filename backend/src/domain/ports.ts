import type {
  CaptureConfig,
  CaptureEvent,
  CaptureEventKind,
  FindingDecisionRecord,
  LiveMessage,
  RawCaptureEvent,
  SessionAnalysis,
  SessionDto,
  SessionReview,
} from '@rastro/shared';
import type { Session } from './session/Session.js';

/** Puertos: contratos que la infraestructura implementa. El dominio y la aplicación solo conocen esto. */

export interface SessionRepository {
  save(session: Session): Promise<void>;
  findById(id: string): Promise<Session | null>;
  list(): Promise<Session[]>;
  /** Borra la sesión y todo lo que se guardó con ella (eventos y video). */
  delete(id: string): Promise<void>;
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
  /** El video empezó a grabarse ahora (sirve para alinear video y eventos). */
  onVideoStarted(): void;
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

/** Decisiones del QA sobre los hallazgos de una sesión (confirmar o descartar), por id de hallazgo. */
export interface FindingDecisionStore {
  read(sessionId: string): Promise<Record<string, FindingDecisionRecord>>;
  /** `record: null` borra la decisión anterior. */
  set(sessionId: string, findingId: string, record: FindingDecisionRecord | null): Promise<void>;
}

/** Veredictos por criterio y momentos marcados por el QA. */
export interface SessionReviewStore {
  read(sessionId: string): Promise<SessionReview>;
  /** Lee, aplica el cambio y guarda, sin que dos cambios seguidos se pisen. */
  update(sessionId: string, change: (review: SessionReview) => SessionReview): Promise<SessionReview>;
}

/** Todo lo que va en el informe de una sesión. */
export interface SessionReportData {
  session: SessionDto;
  analysis: SessionAnalysis;
  review: SessionReview;
  generatedAt: Date;
}

export interface ReportRenderer {
  renderPdf(report: SessionReportData): Promise<Uint8Array>;
}

/** Dónde quedan los informes exportados. Devuelve rutas absolutas. */
export interface ReportStore {
  save(fileName: string, content: Uint8Array): Promise<string>;
  find(fileName: string): Promise<string | null>;
}

/** Abre un archivo con el programa predeterminado del sistema, o lo muestra en su carpeta. */
export interface FileOpener {
  open(path: string): Promise<void>;
  reveal(path: string): Promise<void>;
}

export interface Logger {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}
