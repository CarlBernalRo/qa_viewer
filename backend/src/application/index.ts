import type { BrowserRecorder } from '../domain/ports.js';
import type { RecordingDeps } from './recording/ActiveRecording.js';
import { StartRecording, StopRecording } from './use-cases/recording.js';
import {
  CreateSession,
  GetSession,
  GetSessionEvents,
  GetSessionVideo,
  ListSessions,
  RecoverInterruptedSessions,
} from './use-cases/sessions.js';

export { RecordingRegistry } from './recording/RecordingRegistry.js';
export type { RecordingDeps } from './recording/ActiveRecording.js';

export function createUseCases(deps: RecordingDeps & { recorder: BrowserRecorder }) {
  const { sessions, events, media, clock, ids, recorder } = deps;
  return {
    createSession: new CreateSession(sessions, clock, ids),
    listSessions: new ListSessions(sessions),
    getSession: new GetSession(sessions),
    getSessionEvents: new GetSessionEvents(sessions, events),
    getSessionVideo: new GetSessionVideo(sessions, media),
    startRecording: new StartRecording(recorder, deps),
    stopRecording: new StopRecording(deps),
    recoverInterruptedSessions: new RecoverInterruptedSessions(sessions, clock),
  };
}

export type UseCases = ReturnType<typeof createUseCases>;
