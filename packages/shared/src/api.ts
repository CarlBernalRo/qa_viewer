import { z } from 'zod';
import { findingDecisionSchema } from './findings.js';
import { sessionStatsSchema, sessionStatusSchema } from './session.js';
import { specialistIdSchema } from './agents.js';
import { agentProviderSchema } from './providers.js';

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
  sessionScreenshot: (id: string, file: string) =>
    `/api/sessions/${encodeURIComponent(id)}/screenshots/${encodeURIComponent(file)}`,
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
  sessionBaseline: (id: string) => `/api/sessions/${encodeURIComponent(id)}/baseline`,
  findingDecision: (sessionId: string, findingId: string) =>
    `/api/sessions/${encodeURIComponent(sessionId)}/findings/${encodeURIComponent(findingId)}/decision`,
  startRecording: (id: string) => `/api/sessions/${encodeURIComponent(id)}/recording/start`,
  stopRecording: (id: string) => `/api/sessions/${encodeURIComponent(id)}/recording/stop`,
  live: '/api/live',
  projects: '/api/projects',
  project: (id: string) => `/api/projects/${encodeURIComponent(id)}`,
  agentSettings: '/api/agent-settings',
  agentSetting: (id: string) => `/api/agent-settings/${encodeURIComponent(id)}`,
  settings: '/api/settings',
  settingsModels: (provider: string) => `/api/settings/models?provider=${encodeURIComponent(provider)}`,
} as const;

export const appSettingsSchema = z.object({
  agentProvider: agentProviderSchema,
  agentModel: z.string().optional(),
  geminiApiKey: z.string().optional(),
  openrouterApiKey: z.string().optional(),
  openaiApiKey: z.string().optional(),
  anthropicApiKey: z.string().optional(),
  groqApiKey: z.string().optional(),
  mistralApiKey: z.string().optional(),
  deepseekApiKey: z.string().optional(),
  ollamaApiKey: z.string().optional(),
});
export type AppSettingsDto = z.infer<typeof appSettingsSchema>;

export const updateAppSettingsInputSchema = appSettingsSchema;
export type UpdateAppSettingsInput = z.infer<typeof updateAppSettingsInputSchema>;

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

/** Recomendación puntual del QA para esta corrida de agentes (no persiste como config del agente). */
export const startAgentRunInputSchema = z.object({
  note: z.string().trim().max(1000).optional(),
  agentId: specialistIdSchema.optional(),
});
export type StartAgentRunInput = z.infer<typeof startAgentRunInputSchema>;

/** Sesión base contra la que el agente de Regresión compara. `baselineSessionId: undefined` quita la comparación. */
export const setSessionBaselineInputSchema = z.object({ baselineSessionId: z.string().optional() });
export type SetSessionBaselineInput = z.infer<typeof setSessionBaselineInputSchema>;

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
