import { z } from 'zod';
import { specialistIdSchema } from './agents.js';

export const environmentSchema = z.enum(['DEV', 'QA', 'STG', 'PROD']);
export type Environment = z.infer<typeof environmentSchema>;

export const testTypeSchema = z.enum(['funcional', 'regresion', 'humo', 'exploratoria', 'no-funcional']);
export type TestType = z.infer<typeof testTypeSchema>;

export const TEST_TYPE_LABELS: Record<TestType, string> = {
  funcional: 'Funcional',
  regresion: 'Regresión',
  humo: 'Humo',
  exploratoria: 'Exploratoria',
  'no-funcional': 'No funcional',
};

export const acceptanceCriterionSchema = z.object({
  id: z.string().regex(/^CA\d+$/, 'El id debe tener la forma CA1, CA2…'),
  text: z.string().trim().min(3).max(500),
  source: z.string().trim().max(60).optional(),
});
export type AcceptanceCriterion = z.infer<typeof acceptanceCriterionSchema>;

export const objectiveSchema = z.object({
  sessionName: z.string().trim().min(3).max(120),
  statement: z.string().trim().min(10).max(1000),
  testType: testTypeSchema,
  criteria: z.array(acceptanceCriterionSchema).min(1).max(30),
  scope: z.object({
    include: z.array(z.string().trim().min(1).max(200)).max(50),
    exclude: z.array(z.string().trim().min(1).max(200)).max(50),
  }),
  testData: z.string().trim().max(1000).optional(),
  linkedIssue: z.string().trim().max(60).optional(),
});
export type Objective = z.infer<typeof objectiveSchema>;

export const captureChannelSchema = z.enum([
  'actions',
  'network',
  'websocket',
  'console',
  'performance',
  'accessibility',
  'video',
  'screenshots',
]);
export type CaptureChannel = z.infer<typeof captureChannelSchema>;
export const ALL_CAPTURE_CHANNELS = captureChannelSchema.options;

export const redactionPresetSchema = z.enum(['card-numbers', 'tokens-cookies', 'emails', 'national-ids']);
export type RedactionPreset = z.infer<typeof redactionPresetSchema>;
export const ALL_REDACTION_PRESETS = redactionPresetSchema.options;

/** Modo de análisis. En la etapa 1 del MVP solo existe "none" (grabación + reglas fijas). */
export const analysisModeSchema = z.enum(['none', 'suggested', 'manual']);
export type AnalysisMode = z.infer<typeof analysisModeSchema>;

export const captureConfigSchema = z.object({
  startUrl: z.url({ protocol: /^https?$/ }),
  environment: environmentSchema,
  channels: z.array(captureChannelSchema).min(1),
  redaction: z.object({
    presets: z.array(redactionPresetSchema),
    customPatterns: z.array(z.string().min(1).max(200)).max(20),
  }),
  analysisMode: analysisModeSchema,
  /** Solo con analysisMode "manual" ("Elegir yo"): qué especialistas corren. El QA Lead siempre se agrega. */
  selectedAgents: z.array(specialistIdSchema).optional(),
  /** Proyecto (empresa/cliente) al que pertenece la sesión. Sin definir: "Sin proyecto". */
  projectId: z.string().optional(),
  /** App dentro del proyecto (p. ej. SIS, LMS, CRM). Solo tiene sentido junto a projectId. */
  appName: z.string().optional(),
});
export type CaptureConfig = z.infer<typeof captureConfigSchema>;

export const createSessionInputSchema = z.object({
  objective: objectiveSchema,
  capture: captureConfigSchema,
});
export type CreateSessionInput = z.infer<typeof createSessionInputSchema>;

export const sessionStatusSchema = z.enum(['draft', 'recording', 'completed', 'failed']);
export type SessionStatus = z.infer<typeof sessionStatusSchema>;

export const sessionStatsSchema = z.object({
  actions: z.number().int().nonnegative(),
  requests: z.number().int().nonnegative(),
  wsFrames: z.number().int().nonnegative(),
  consoleLogs: z.number().int().nonnegative(),
  errors: z.number().int().nonnegative(),
});
export type SessionStats = z.infer<typeof sessionStatsSchema>;

export const EMPTY_STATS: SessionStats = {
  actions: 0,
  requests: 0,
  wsFrames: 0,
  consoleLogs: 0,
  errors: 0,
};

export const sessionSchema = z.object({
  id: z.string(),
  createdAt: z.iso.datetime(),
  startedAt: z.iso.datetime().optional(),
  endedAt: z.iso.datetime().optional(),
  status: sessionStatusSchema,
  failureReason: z.string().optional(),
  objective: objectiveSchema,
  capture: captureConfigSchema,
  stats: sessionStatsSchema,
  hasVideo: z.boolean(),
  /** Cuántos ms después del inicio de la sesión empezó el video (para alinear video y eventos). */
  videoOffsetMs: z.number().nonnegative().optional(),
  /** Bytes en disco de todo lo que dejó la sesión (video, eventos, agentes…). Se calcula al leer, no se guarda. */
  sizeBytes: z.number().int().nonnegative().optional(),
  /** Sesión contra la que el agente de Regresión compara esta. Sin definir: no hay comparación. */
  baselineSessionId: z.string().optional(),
});
export type SessionDto = z.infer<typeof sessionSchema>;
