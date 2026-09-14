import type {
  BrowserRecorder,
  FileOpener,
  FindingDecisionStore,
  ReportRenderer,
  ReportStore,
  SessionReviewStore,
} from '../domain/ports.js';
import type { RecordingDeps } from './recording/ActiveRecording.js';
import { AnalyzeSession, SetFindingDecision } from './use-cases/analysis.js';
import { StartRecording, StopRecording } from './use-cases/recording.js';
import { ExportSessionReport, OpenSessionReport } from './use-cases/report.js';
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
};

export function createUseCases(deps: AppDeps) {
  const { sessions, events, media, clock, ids, recorder, decisions, reviews, renderer, reportStore, opener } = deps;
  const analyzeSession = new AnalyzeSession(sessions, events, decisions, clock);
  return {
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
    exportSessionReport: new ExportSessionReport(sessions, analyzeSession, reviews, renderer, reportStore, clock),
    openSessionReport: new OpenSessionReport(sessions, reportStore, opener),
    startRecording: new StartRecording(recorder, deps),
    stopRecording: new StopRecording(deps),
    recoverInterruptedSessions: new RecoverInterruptedSessions(sessions, clock),
  };
}

export type UseCases = ReturnType<typeof createUseCases>;
