import type {
  AgentModel,
  AgentRunStore,
  AgentSettingsStore,
  BrowserRecorder,
  FileOpener,
  FindingDecisionStore,
  ProjectRepository,
  ReportRenderer,
  ReportStore,
  SessionReviewStore,
  SessionStorageInspector,
} from '../domain/ports.js';
import type { RecordingDeps } from './recording/ActiveRecording.js';
import { GetAgentStatus, ListAgentRuns, StartAgentRun } from './use-cases/agents.js';
import { AnalyzeSession, SetFindingDecision } from './use-cases/analysis.js';
import { StartRecording, StopRecording } from './use-cases/recording.js';
import { ExportSessionReport, GenerateLoadScript, OpenSessionReport } from './use-cases/report.js';
import { AddMarker, GetSessionReview, RemoveMarker, SetCriterionVerdict } from './use-cases/review.js';
import { GetAgentSettings, UpdateAgentSettings } from './use-cases/agent-settings.js';
import { GetAppSettings, UpdateAppSettings } from './use-cases/settings.js';
import { ListProviderModels } from './use-cases/provider-models.js';
import { CreateProject, DeleteProject, ListProjects, UpdateProject } from './use-cases/projects.js';
import {
  CreateSession,
  DeleteSession,
  GetSession,
  GetSessionEvents,
  GetSessionScreenshot,
  GetSessionVideo,
  ListSessions,
  RecoverInterruptedSessions,
  SetSessionBaseline,
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
  storage: SessionStorageInspector;
  projects: ProjectRepository;
  agentSettings: AgentSettingsStore;
  envPath: string;
};

export function createUseCases(deps: AppDeps) {
  const { sessions, events, media, clock, ids, recorder, decisions, reviews, renderer, reportStore, opener, envPath } = deps;
  const analyzeSession = new AnalyzeSession(sessions, events, decisions, clock);
  const startAgentRun = new StartAgentRun(
    sessions,
    events,
    analyzeSession,
    reviews,
    deps.agentRuns,
    deps.agentSettings,
    deps.screenshots,
    deps.agentModel,
    clock,
    ids,
    deps.logger,
  );
  return {
    getAgentStatus: new GetAgentStatus(deps.agentModel, deps.agentModelName, deps.agentProvider),
    startAgentRun,
    listAgentRuns: new ListAgentRuns(sessions, deps.agentRuns, (id) => startAgentRun.isRunning(id)),
    getAgentSettings: new GetAgentSettings(deps.agentSettings),
    updateAgentSettings: new UpdateAgentSettings(deps.agentSettings),
    getAppSettings: new GetAppSettings(envPath),
    updateAppSettings: new UpdateAppSettings(envPath),
    listProviderModels: new ListProviderModels(),
    createSession: new CreateSession(sessions, clock, ids),
    listSessions: new ListSessions(sessions, deps.storage),
    getSession: new GetSession(sessions, deps.storage),
    getSessionEvents: new GetSessionEvents(sessions, events),
    getSessionVideo: new GetSessionVideo(sessions, media),
    getSessionScreenshot: new GetSessionScreenshot(sessions, deps.screenshots),
    deleteSession: new DeleteSession(sessions, (id) => deps.registry.has(id)),
    setSessionBaseline: new SetSessionBaseline(sessions),
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
    createProject: new CreateProject(deps.projects, clock, ids),
    listProjects: new ListProjects(deps.projects),
    updateProject: new UpdateProject(deps.projects),
    deleteProject: new DeleteProject(deps.projects, sessions),
  };
}

export type UseCases = ReturnType<typeof createUseCases>;
