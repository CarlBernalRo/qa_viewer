import { isErrorEvent, type CaptureEvent, type SessionStats } from '@rastro/shared';

/** Devuelve las estadísticas actualizadas con un evento nuevo, sin mutar las anteriores. */
export function applyEventToStats(stats: SessionStats, event: CaptureEvent): SessionStats {
  const next = { ...stats };
  switch (event.kind) {
    case 'user-action':
      next.actions += 1;
      break;
    case 'http-request':
      next.requests += 1;
      break;
    case 'ws-frame':
    case 'sse-message':
      next.wsFrames += 1;
      break;
    case 'console':
      next.consoleLogs += 1;
      break;
    default:
      break;
  }
  if (isErrorEvent(event)) next.errors += 1;
  return next;
}
