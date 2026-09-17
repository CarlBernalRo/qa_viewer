import type {
  AgentModel,
  AgentRunStore,
  BrowserRecorder,
  FileOpener,
  FindingDecisionStore,
  ReportRenderer,
  ReportStore,
  SessionReviewStore,
} from '../domain/ports.js';
import type { RecordingDeps } from './recording/ActiveRecording.js';
import { GetAgentStatus, ListAgentRuns, StartAgentRun } from './use-cases/agents.js';
import { AnalyzeSession, SetFindingDecision } from './use-cases/analysis.js';
import { StartRecording, StopRecording } from './use-cases/recording.js';
import { ExportSessionReport, GenerateLoadScript, OpenSessionReport } from './use-cases/report.js';
import { AddMarker, GetSessionReview, RemoveMarker, SetCriterionVerdict } from './use-cases/review.js';
import {
  CreateSession,
  DeleteSession,
  GetSession,
  GetSessionEvents,
  GetSessionVideo,
  ListSessions,
  RecoverInterruptedSessions,
} from './use-cases/sessions.js';

export { RecordingRegistry } from './recording/RecordingRegistry.js';
export type { RecordingDeps } from './recording/ActiveRecording.js';
export { reportFileName } from './use-cases/report.js';

/** Todo lo que la aplicación necesita de la infraestructura. */
export type AppDeps = RecordingDeps & {
  recorder: BrowserRecorder;
  decisions: FindingDecisionStore;
  reviews: SessionReviewStore;
  renderer: ReportRenderer;
  reportStore: ReportStore;
  opener: FileOpener;
  /** null si no hay credenciales: los agentes quedan desactivados. */
  agentModel: AgentModel | null;
  /** Modelo y proveedor configurados (para informar aunque falte la clave). */
  agentModelName: string;
  agentProvider: string;
  agentRuns: AgentRunStore;
};

export function createUseCases(deps: AppDeps) {
  const { sessions, events, media, clock, ids, recorder, decisions, reviews, renderer, reportStore, opener } = deps;
  const analyzeSession = new AnalyzeSession(sessions, events, decisions, clock);
  const startAgentRun = new StartAgentRun(
    sessions,
    events,
    analyzeSession,
    reviews,
    deps.agentRuns,
    deps.agentModel,
    clock,
    ids,
    deps.logger,
  );
  return {
    getAgentStatus: new GetAgentStatus(deps.agentModel, deps.agentModelName, deps.agentProvider),
    startAgentRun,
    listAgentRuns: new ListAgentRuns(sessions, deps.agentRuns, (id) => startAgentRun.isRunning(id)),
    createSession: new CreateSession(sessions, clock, ids),
    listSessions: new ListSessions(sessions),
    getSession: new GetSession(sessions),
    getSessionEvents: new GetSessionEvents(sessions, events),
    getSessionVideo: new GetSessionVideo(sessions, media),
    deleteSession: new DeleteSession(sessions, (id) => deps.registry.has(id)),
    analyzeSession,
    setFindingDecision: new SetFindingDecision(analyzeSession, decisions, clock),
    getSessionReview: new GetSessionReview(sessions, reviews),
    addMarker: new AddMarker(sessions, reviews, clock, ids),
    removeMarker: new RemoveMarker(sessions, reviews),
    setCriterionVerdict: new SetCriterionVerdict(sessions, reviews, clock),
    exportSessionReport: new ExportSessionReport(sessions, analyzeSession, reviews, renderer, reportStore, clock, deps.agentRuns),
    openSessionReport: new OpenSessionReport(sessions, reportStore, opener),
    generateLoadScript: new GenerateLoadScript(sessions, events),
    startRecording: new StartRecording(recorder, deps),
    stopRecording: new StopRecording(deps, deps.agentModel ? startAgentRun : null),
    recoverInterruptedSessions: new RecoverInterruptedSessions(sessions, clock),
  };
}

export type UseCases = ReturnType<typeof createUseCases>;
