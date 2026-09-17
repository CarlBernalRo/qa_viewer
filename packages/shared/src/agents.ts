import { z } from 'zod';
import { findingSeveritySchema } from './findings.js';

/** El equipo de agentes: especialistas y un QA Lead que junta lo que encuentran. */
export const agentIdSchema = z.enum(['api', 'frontend', 'sec', 'a11y', 'perf', 'rt', 'func', 'env', 'lead']);
export type AgentId = z.infer<typeof agentIdSchema>;

/** Orden de trabajo: los especialistas primero; el QA Lead lee sus informes. */
export const AGENT_ORDER: readonly AgentId[] = ['api', 'frontend', 'sec', 'a11y', 'perf', 'rt', 'func', 'env', 'lead'];

/** Los especialistas que el QA puede elegir en el modo "Elegir yo" (el QA Lead siempre corre, junta lo que encuentren). */
export const specialistIdSchema = z.enum(['api', 'frontend', 'sec', 'a11y', 'perf', 'rt', 'func', 'env']);
export type SpecialistId = z.infer<typeof specialistIdSchema>;
export const SPECIALIST_AGENTS: readonly SpecialistId[] = ['api', 'frontend', 'sec', 'a11y', 'perf', 'rt', 'func', 'env'];

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
    role: 'Revisa las llamadas HTTP a la API: estados, tiempos, cuerpos enviados y respuestas que no cuadran con lo que se esperaba.',
    reads: 'Red (HTTP)',
    color: '#16907f',
  },
  frontend: {
    name: 'Front-end',
    role: 'Revisa lo que pasó en la pantalla: acciones del usuario, errores de JavaScript sin capturar y consola.',
    reads: 'Acciones y consola',
    color: '#b7801a',
  },
  sec: {
    name: 'Seguridad',
    role: 'Revisa headers de respuesta, cookies y URLs del propio sitio en busca de credenciales expuestas o contenido inseguro, más allá de lo que ya marcan las reglas fijas.',
    reads: 'Red (headers y cookies)',
    color: '#4b5a9e',
  },
  a11y: {
    name: 'Accesibilidad',
    role: 'Revisa las violaciones WCAG que encontró axe-core en cada pantalla: cuáles importan para el objetivo y por qué.',
    reads: 'Accesibilidad (axe-core)',
    color: '#5e7f1f',
  },
  perf: {
    name: 'Rendimiento',
    role: 'Revisa Web Vitals (LCP, CLS, INP) y bloqueos largos de cada pantalla contra los umbrales de Google.',
    reads: 'Rendimiento (Web Vitals)',
    color: '#b8507a',
  },
  rt: {
    name: 'Tiempo real',
    role: 'Revisa las conversaciones de WebSocket y SSE: mensajes de error, reconexiones y secuencias fuera de orden.',
    reads: 'WebSocket y SSE',
    color: '#7b5cc9',
  },
  func: {
    name: 'Funcional',
    role: 'Une cada acción del usuario con lo que pasó justo después (requests, errores, cambios de pantalla) para ver si el flujo funcionó como debía; sugiere casos de prueba a partir de lo navegado.',
    reads: 'Acciones, navegación y su consecuencia inmediata',
    color: '#2f7fbf',
  },
  env: {
    name: 'Ambiente',
    role: 'Revisa qué versión, build y configuración expone el sitio (headers, consola) para el ambiente en el que se grabó.',
    reads: 'Red y consola (versión y build)',
    color: '#5f6863',
  },
  lead: {
    name: 'QA Lead',
    role: 'Junta lo que encontraron los especialistas, une lo repetido y propone un veredicto para cada criterio de aceptación.',
    reads: 'Los informes de los especialistas y el objetivo',
    color: '#6b4fbb',
  },
};

// ---------------------------------------------------------------------------
// Equipo completo de la visión de producto (rastro-vision.html, "Un agente por
// aspecto"): 12 especialistas + QA Lead. Los 8 especialistas de AGENT_CATALOG
// (arriba) más el QA Lead corren de verdad; UI/UX, Carga, Regresión y Reportero
// quedan en catálogo porque necesitan una capacidad que Rastro todavía no tiene
// (ver la nota en cada uno) y no tienen lógica de ejecución ni schema propio.
// No confundir con AgentId/agentIdSchema, que valida lo que de verdad puede
// devolver el modelo.
// ---------------------------------------------------------------------------

export type AgentRosterId =
  | 'lead'
  | 'env'
  | 'func'
  | 'api'
  | 'frontend'
  | 'rt'
  | 'perf'
  | 'sec'
  | 'a11y'
  | 'ux'
  | 'load'
  | 'reg'
  | 'rep';

export const AGENT_ROSTER_ORDER: readonly AgentRosterId[] = [
  'lead',
  'env',
  'func',
  'api',
  'frontend',
  'rt',
  'perf',
  'sec',
  'a11y',
  'ux',
  'load',
  'reg',
  'rep',
];

/** Forma de los ojos del robot: da identidad visual propia a cada rol. */
export type AgentEyeShape = 'round' | 'visor' | 'square';

/** Estilo de animación de ojos en reposo, para que cada agente "respire" distinto. */
export type AgentAnimation = 'blink' | 'blink-slow' | 'pulse' | 'scan';

/** Gesto de cabeza en reposo, aparte del parpadeo: la otra mitad de la personalidad de cada robot. */
export type AgentGesture = 'tilt' | 'nod' | 'turn';

export interface AgentRosterMeta extends AgentMeta {
  /** true: hace algo real hoy (como especialista de IA o como generador determinístico). false: solo catálogo. */
  implemented: boolean;
  /**
   * "analysis": especialista de IA, forma parte del equipo de "Sugeridos"/"Elegir yo" (ver AgentId).
   * "generator": función determinística aparte, sin IA, que el QA dispara a mano desde la sesión.
   * Sin definir: todavía no implementado (ver `implemented`).
   */
  capability?: 'analysis' | 'generator';
  eyeShape: AgentEyeShape;
  animation: AgentAnimation;
  gesture: AgentGesture;
}

export const AGENT_ROSTER: Record<AgentRosterId, AgentRosterMeta> = {
  lead: { ...AGENT_CATALOG.lead, implemented: true, capability: 'analysis', eyeShape: 'visor', animation: 'pulse', gesture: 'nod' },
  api: { ...AGENT_CATALOG.api, implemented: true, capability: 'analysis', eyeShape: 'round', animation: 'blink', gesture: 'turn' },
  frontend: {
    ...AGENT_CATALOG.frontend,
    implemented: true,
    capability: 'analysis',
    eyeShape: 'square',
    animation: 'blink',
    gesture: 'tilt',
  },
  env: { ...AGENT_CATALOG.env, implemented: true, capability: 'analysis', eyeShape: 'square', animation: 'scan', gesture: 'turn' },
  func: { ...AGENT_CATALOG.func, implemented: true, capability: 'analysis', eyeShape: 'round', animation: 'blink', gesture: 'tilt' },
  rt: { ...AGENT_CATALOG.rt, implemented: true, capability: 'analysis', eyeShape: 'round', animation: 'scan', gesture: 'turn' },
  perf: { ...AGENT_CATALOG.perf, implemented: true, capability: 'analysis', eyeShape: 'visor', animation: 'pulse', gesture: 'nod' },
  sec: { ...AGENT_CATALOG.sec, implemented: true, capability: 'analysis', eyeShape: 'visor', animation: 'scan', gesture: 'turn' },
  a11y: {
    ...AGENT_CATALOG.a11y,
    implemented: true,
    capability: 'analysis',
    eyeShape: 'round',
    animation: 'blink-slow',
    gesture: 'tilt',
  },
  ux: {
    name: 'UI/UX',
    role: 'Inconsistencias visuales, heurísticas de Nielsen y problemas de responsive. Necesita ver capturas de pantalla (entrada con imágenes), algo que los agentes de Rastro todavía no reciben.',
    reads: 'Capturas y DOM',
    color: '#8c6a4f',
    implemented: false,
    eyeShape: 'square',
    animation: 'blink',
    gesture: 'tilt',
  },
  load: {
    name: 'Carga',
    role: 'Genera un script k6 parametrizado desde el tráfico real de la sesión: un request de muestra por endpoint propio, en el orden en que se lanzaron. Es determinístico, sin IA: "Descargar script de carga (k6)" en el menú Acciones de la sesión.',
    reads: 'Red',
    color: '#3d6b7a',
    implemented: true,
    capability: 'generator',
    eyeShape: 'square',
    animation: 'pulse',
    gesture: 'nod',
  },
  reg: {
    name: 'Regresión',
    role: 'Compara con una sesión base: tráfico nuevo, errores nuevos, cambios visuales. Necesita "Comparaciones" (etapa 4): marcar una sesión como base y comparar contra otra, algo que Rastro todavía no tiene.',
    reads: 'Red, consola y capturas',
    color: '#8a7a2a',
    implemented: false,
    eyeShape: 'round',
    animation: 'scan',
    gesture: 'turn',
  },
  rep: {
    name: 'Reportero',
    role: 'Arma el informe de toda la sesión en Markdown (objetivo, veredicto por criterio, hallazgos confirmados y la propuesta de los agentes) para pegar en Jira, Linear, Slack o Teams. Es determinístico, sin IA: "Copiar informe completo" en el menú Acciones de la sesión. Crear el ticket directo en la herramienta necesita las integraciones de "Ajustes del proyecto" (etapa 4).',
    reads: '—',
    color: '#2f4858',
    implemented: true,
    capability: 'generator',
    eyeShape: 'visor',
    animation: 'blink-slow',
    gesture: 'nod',
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

export const confidenceSchema = z.enum(['high', 'medium', 'low']);
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

export const specialistAssessmentSchema = z.enum(['supports_pass', 'supports_fail', 'inconclusive']);
export type SpecialistAssessment = z.infer<typeof specialistAssessmentSchema>;

export const SPECIALIST_ASSESSMENT_LABELS: Record<SpecialistAssessment, string> = {
  supports_pass: 'Apoya que cumple',
  supports_fail: 'Apoya que no cumple',
  inconclusive: 'Sin evidencia concluyente',
};

/** El razonamiento propio de un especialista por criterio, para no perderlo dentro de un único resumen en prosa. */
export const agentStepCriterionSchema = z.object({
  criterionId: z.string(),
  assessment: specialistAssessmentSchema,
  reason: z.string(),
  evidence: z.array(z.string()),
});
export type AgentStepCriterion = z.infer<typeof agentStepCriterionSchema>;

export const agentStepSchema = z.object({
  agentId: agentIdSchema,
  status: z.enum(['pending', 'running', 'done', 'failed']),
  summary: z.string().optional(),
  criteria: z.array(agentStepCriterionSchema).optional(),
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
  high: 'confianza alta',
  medium: 'confianza media',
  low: 'confianza baja',
};
