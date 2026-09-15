import { z } from 'zod';
import { findingSeveritySchema } from './findings.js';

/** El equipo de agentes: dos especialistas y un QA Lead que junta lo que encuentran. */
export const agentIdSchema = z.enum(['api', 'frontend', 'lead']);
export type AgentId = z.infer<typeof agentIdSchema>;

/** Orden de trabajo: los especialistas primero; el QA Lead lee sus informes. */
export const AGENT_ORDER: readonly AgentId[] = ['api', 'frontend', 'lead'];

export interface AgentMeta {
  name: string;
  /** Qué hace, en una frase (tooltips y prompts). */
  role: string;
  /** Qué parte de la sesión lee. */
  reads: string;
  /** Color del robot. */
  color: string;
}

export const AGENT_CATALOG: Record<AgentId, AgentMeta> = {
  api: {
    name: 'API REST',
    role: 'Revisa las llamadas a la API y los mensajes en tiempo real: estados, tiempos, errores y respuestas que no cuadran con lo que se esperaba.',
    reads: 'Red y WebSocket',
    color: '#16907f',
  },
  frontend: {
    name: 'Front-end',
    role: 'Revisa lo que pasó en la pantalla: acciones del usuario, errores de JavaScript, consola, accesibilidad y rendimiento.',
    reads: 'Acciones, consola, accesibilidad y rendimiento',
    color: '#b7801a',
  },
  lead: {
    name: 'QA Lead',
    role: 'Junta lo que encontraron los especialistas, une lo repetido y propone un veredicto para cada criterio de aceptación.',
    reads: 'Los informes de los especialistas y el objetivo',
    color: '#6b4fbb',
  },
};

// ---------------------------------------------------------------------------
// Lo que devuelve el modelo (salida estructurada). La evidencia son referencias
// cortas (E1, E2…) que el backend traduce a eventos reales y valida.
// ---------------------------------------------------------------------------

const modelObservationSchema = z.object({
  title: z.string(),
  severity: findingSeveritySchema,
  detail: z.string(),
  recommendation: z.string(),
  criterionId: z.string().nullable(),
  evidence: z.array(z.string()),
});

export const specialistReportSchema = z.object({
  summary: z.string(),
  criteria: z.array(
    z.object({
      criterionId: z.string(),
      assessment: z.enum(['supports_pass', 'supports_fail', 'inconclusive']),
      reason: z.string(),
      evidence: z.array(z.string()),
    }),
  ),
  observations: z.array(modelObservationSchema),
});
export type SpecialistReport = z.infer<typeof specialistReportSchema>;

export const proposedVerdictSchema = z.enum(['pass', 'fail', 'blocked', 'inconclusive']);
export type ProposedVerdict = z.infer<typeof proposedVerdictSchema>;

export const confidenceSchema = z.enum(['low', 'medium', 'high']);
export type Confidence = z.infer<typeof confidenceSchema>;

export const leadReportSchema = z.object({
  summary: z.string(),
  verdicts: z.array(
    z.object({
      criterionId: z.string(),
      verdict: proposedVerdictSchema,
      confidence: confidenceSchema,
      rationale: z.string(),
      evidence: z.array(z.string()),
    }),
  ),
  observations: z.array(modelObservationSchema.extend({ agents: z.array(agentIdSchema) })),
});
export type LeadReport = z.infer<typeof leadReportSchema>;

// ---------------------------------------------------------------------------
// Lo que se guarda y se muestra: un análisis por corrida, con la evidencia ya
// convertida en ids de eventos.
// ---------------------------------------------------------------------------

export const agentStepSchema = z.object({
  agentId: agentIdSchema,
  status: z.enum(['pending', 'running', 'done', 'failed']),
  summary: z.string().optional(),
  error: z.string().optional(),
  finishedAt: z.iso.datetime().optional(),
});
export type AgentStep = z.infer<typeof agentStepSchema>;

export const agentProposalSchema = z.object({
  criterionId: z.string(),
  verdict: proposedVerdictSchema,
  confidence: confidenceSchema,
  rationale: z.string(),
  evidence: z.array(z.string()),
});
export type AgentProposal = z.infer<typeof agentProposalSchema>;

export const agentFindingSchema = z.object({
  id: z.string(),
  /** Agentes que lo respaldan. */
  agents: z.array(agentIdSchema).min(1),
  title: z.string(),
  severity: findingSeveritySchema,
  detail: z.string(),
  recommendation: z.string(),
  criterionId: z.string().nullable(),
  evidence: z.array(z.string()),
});
export type AgentFinding = z.infer<typeof agentFindingSchema>;

export const agentUsageSchema = z.object({
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  cacheReadTokens: z.number().int().nonnegative(),
  cacheWriteTokens: z.number().int().nonnegative(),
});
export type AgentUsage = z.infer<typeof agentUsageSchema>;

export const agentRunSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  status: z.enum(['running', 'completed', 'failed']),
  model: z.string(),
  startedAt: z.iso.datetime(),
  finishedAt: z.iso.datetime().optional(),
  error: z.string().optional(),
  steps: z.array(agentStepSchema),
  summary: z.string().optional(),
  proposals: z.array(agentProposalSchema),
  findings: z.array(agentFindingSchema),
  usage: agentUsageSchema,
});
export type AgentRun = z.infer<typeof agentRunSchema>;

/** Corridas de una sesión, la más reciente primero. */
export const agentRunListSchema = z.object({ runs: z.array(agentRunSchema) });
export type AgentRunList = z.infer<typeof agentRunListSchema>;

export const agentStatusSchema = z.object({
  available: z.boolean(),
  /** Proveedor del modelo (a quién se envía el resumen), p. ej., "Google Gemini". */
  provider: z.string(),
  model: z.string(),
  /** Por qué no están disponibles (p. ej., falta la clave). */
  reason: z.string().optional(),
});
export type AgentStatus = z.infer<typeof agentStatusSchema>;

export const PROPOSED_VERDICT_LABELS: Record<ProposedVerdict, string> = {
  pass: 'Cumple',
  fail: 'No cumple',
  blocked: 'Bloqueado',
  inconclusive: 'Sin evidencia suficiente',
};

export const CONFIDENCE_LABELS: Record<Confidence, string> = {
  low: 'confianza baja',
  medium: 'confianza media',
  high: 'confianza alta',
};
