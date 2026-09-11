import { z } from 'zod';
import { sessionStatsSchema, sessionStatusSchema } from './session.js';

/** Rutas HTTP del backend, compartidas para que el cliente no tenga strings sueltos. */
export const API_ROUTES = {
  health: '/api/health',
  sessions: '/api/sessions',
  session: (id: string) => `/api/sessions/${encodeURIComponent(id)}`,
  sessionEvents: (id: string) => `/api/sessions/${encodeURIComponent(id)}/events`,
  sessionVideo: (id: string) => `/api/sessions/${encodeURIComponent(id)}/video`,
  startRecording: (id: string) => `/api/sessions/${encodeURIComponent(id)}/recording/start`,
  stopRecording: (id: string) => `/api/sessions/${encodeURIComponent(id)}/recording/stop`,
  live: '/api/live',
} as const;

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});
export type ApiError = z.infer<typeof apiErrorSchema>;

export const healthSchema = z.object({
  status: z.literal('ok'),
  version: z.string(),
  activeRecordings: z.number().int().nonnegative(),
});
export type Health = z.infer<typeof healthSchema>;

/** Mensajes que el backend empuja por WebSocket al frontend. */
export const liveMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('session-status'),
    sessionId: z.string(),
    status: sessionStatusSchema,
    failureReason: z.string().optional(),
  }),
  z.object({
    type: z.literal('session-stats'),
    sessionId: z.string(),
    elapsedMs: z.number().nonnegative(),
    stats: sessionStatsSchema,
  }),
]);
export type LiveMessage = z.infer<typeof liveMessageSchema>;
