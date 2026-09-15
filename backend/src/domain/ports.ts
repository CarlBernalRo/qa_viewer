import type { ZodType } from 'zod';
import type {
  AgentId,
  AgentRun,
  CaptureConfig,
  CaptureEvent,
  CaptureEventKind,
  FindingDecisionRecord,
  LiveMessage,
  RawCaptureEvent,
  SessionAnalysis,
  SessionDto,
  SessionReview,
  SpecialistReport,
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

export interface AgentModelUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export interface AgentModelRequest<T> {
  agentId: AgentId;
  /** Reglas comunes a todos los agentes. */
  system: string;
  /** Resumen de la sesión, igual para los tres agentes: se cachea. */
  brief: string;
  /** Instrucciones y evidencia propias de este agente. */
  task: string;
  /** Forma de la respuesta (salida estructurada). */
  schema: ZodType<T>;
}

/** El modelo de lenguaje que usan los agentes. */
export interface AgentModel {
  /** A quién se envía el resumen (se muestra al QA antes de analizar). */
  readonly provider: string;
  readonly model: string;
  run<T>(request: AgentModelRequest<T>): Promise<{ output: T; usage: AgentModelUsage }>;
}

/**
 * Lo necesario para retomar un análisis sin volver a consultar a los agentes que ya
 * respondieron: el contexto exacto que recibieron y sus informes.
 */
export interface AgentCheckpoint {
  brief: string;
  digests: { api: string; frontend: string };
  /** Referencia corta → id de evento (E1 → …). */
  refs: Array<[string, string]>;
  reports: Partial<Record<'api' | 'frontend', SpecialistReport>>;
}

/** Corridas de los agentes por sesión. */
export interface AgentRunStore {
  /** La más reciente primero. */
  list(sessionId: string): Promise<AgentRun[]>;
  /** Crea o reemplaza la corrida con el mismo id. */
  save(run: AgentRun): Promise<void>;
  saveCheckpoint(sessionId: string, runId: string, checkpoint: AgentCheckpoint): Promise<void>;
  /** null si la corrida no tiene punto de control (p. ej., de una versión anterior). */
  loadCheckpoint(sessionId: string, runId: string): Promise<AgentCheckpoint | null>;
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
