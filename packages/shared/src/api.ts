import { z } from 'zod';
import { findingDecisionSchema } from './findings.js';
import { sessionStatsSchema, sessionStatusSchema } from './session.js';

/** Rutas HTTP del backend, compartidas para que el cliente no tenga strings sueltos. */
export const API_ROUTES = {
  health: '/api/health',
  agentStatus: '/api/agents/status',
  sessionAgents: (id: string) => `/api/sessions/${encodeURIComponent(id)}/agents`,
  agentRunRetry: (id: string, runId: string) =>
    `/api/sessions/${encodeURIComponent(id)}/agents/${encodeURIComponent(runId)}/retry`,
  sessions: '/api/sessions',
  session: (id: string) => `/api/sessions/${encodeURIComponent(id)}`,
  sessionEvents: (id: string) => `/api/sessions/${encodeURIComponent(id)}/events`,
  sessionVideo: (id: string) => `/api/sessions/${encodeURIComponent(id)}/video`,
  sessionFindings: (id: string) => `/api/sessions/${encodeURIComponent(id)}/findings`,
  sessionReview: (id: string) => `/api/sessions/${encodeURIComponent(id)}/review`,
  sessionMarkers: (id: string) => `/api/sessions/${encodeURIComponent(id)}/markers`,
  sessionMarker: (id: string, markerId: string) =>
    `/api/sessions/${encodeURIComponent(id)}/markers/${encodeURIComponent(markerId)}`,
  criterionVerdict: (id: string, criterionId: string) =>
    `/api/sessions/${encodeURIComponent(id)}/criteria/${encodeURIComponent(criterionId)}`,
  sessionReport: (id: string) => `/api/sessions/${encodeURIComponent(id)}/report`,
  sessionReportOpen: (id: string) => `/api/sessions/${encodeURIComponent(id)}/report/open`,
  sessionLoadScript: (id: string) => `/api/sessions/${encodeURIComponent(id)}/load-script`,
  findingDecision: (sessionId: string, findingId: string) =>
    `/api/sessions/${encodeURIComponent(sessionId)}/findings/${encodeURIComponent(findingId)}/decision`,
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

/** Cuerpo de PUT .../decision. `decision: null` limpia la decisión anterior. */
export const setFindingDecisionInputSchema = z.object({
  decision: findingDecisionSchema.nullable(),
  note: z.string().trim().max(500).optional(),
});
export type SetFindingDecisionInput = z.infer<typeof setFindingDecisionInputSchema>;

/** Informe PDF exportado: dónde quedó guardado. */
export const sessionReportSchema = z.object({
  fileName: z.string(),
  path: z.string(),
  generatedAt: z.iso.datetime(),
  /** Hallazgos incluidos (sin los descartados). */
  findings: z.number().int().nonnegative(),
});
export type SessionReportDto = z.infer<typeof sessionReportSchema>;

/** `reveal: true` muestra el archivo en su carpeta en vez de abrirlo. */
export const openReportInputSchema = z.object({ reveal: z.boolean().default(false) });

/** Script k6 generado del tráfico real de la sesión (determinístico, sin IA). */
export const loadScriptSchema = z.object({ fileName: z.string(), script: z.string() });
export type LoadScriptDto = z.infer<typeof loadScriptSchema>;

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
