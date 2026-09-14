import { z } from 'zod';
import type { CaptureChannel } from './session.js';

/** Cuánto afecta un hallazgo al objetivo o al usuario. */
export const findingSeveritySchema = z.enum(['critical', 'high', 'medium', 'low']);
export type FindingSeverity = z.infer<typeof findingSeveritySchema>;
export const FINDING_SEVERITIES = findingSeveritySchema.options;

export const findingCategorySchema = z.enum([
  'functional',
  'network',
  'security',
  'accessibility',
  'frontend',
  'realtime',
  'performance',
]);
export type FindingCategory = z.infer<typeof findingCategorySchema>;
export const FINDING_CATEGORIES = findingCategorySchema.options;

export const ruleIdSchema = z.enum([
  'http-server-error',
  'http-client-error',
  'http-network-failure',
  'slow-request',
  'duplicate-request',
  'error-in-success',
  'large-response',
  'missing-security-headers',
  'insecure-cookie',
  'token-in-url',
  'mixed-content',
  'server-disclosure',
  'a11y-violation',
  'uncaught-exception',
  'console-error',
  'console-warning',
  'ws-protocol-error',
  'ws-reconnect-loop',
  'poor-web-vital',
  'long-task',
]);
export type RuleId = z.infer<typeof ruleIdSchema>;

export interface RuleMeta {
  title: string;
  category: FindingCategory;
  /** Canales que la regla necesita; si no se capturaron, la regla no corre. */
  requires: readonly CaptureChannel[];
  /** Qué revisa, en una o dos frases (se muestra en los tooltips). */
  description: string;
}

/** Catálogo de reglas fijas: el backend las ejecuta y el frontend explica qué revisa cada una. */
export const RULE_CATALOG: Record<RuleId, RuleMeta> = {
  'http-server-error': {
    title: 'Errores del servidor (5xx)',
    category: 'network',
    requires: ['network'],
    description: 'Respuestas 500–599: el servidor falló al procesar la petición.',
  },
  'http-client-error': {
    title: 'Peticiones rechazadas (4xx)',
    category: 'network',
    requires: ['network'],
    description: 'Respuestas 400–499: datos inválidos, falta de permisos o un recurso que no existe.',
  },
  'http-network-failure': {
    title: 'Peticiones que no llegaron',
    category: 'network',
    requires: ['network'],
    description:
      'Peticiones que fallaron sin respuesta: DNS, conexión cortada, CORS o certificado. No cuenta las que canceló el navegador.',
  },
  'slow-request': {
    title: 'Peticiones lentas',
    category: 'network',
    requires: ['network'],
    description: 'Llamadas a la API y páginas que tardan 3 s o más en responder.',
  },
  'duplicate-request': {
    title: 'Peticiones repetidas',
    category: 'network',
    requires: ['network'],
    description:
      'La misma llamada a la API con los mismos datos: un envío (POST, PUT…) 2 veces en 1 s o una consulta 3 veces en 2 s. Suele ser un doble click o un efecto que se dispara de más.',
  },
  'error-in-success': {
    title: 'Falso éxito',
    category: 'network',
    requires: ['network'],
    description:
      'Respuestas 2xx cuyo JSON trae un error (error, errors, success: false, status: "error"). La interfaz puede mostrar éxito aunque falló.',
  },
  'large-response': {
    title: 'Respuestas pesadas',
    category: 'network',
    requires: ['network'],
    description: 'Respuestas de la API de 1 MB o más.',
  },
  'missing-security-headers': {
    title: 'Headers de seguridad faltantes',
    category: 'security',
    requires: ['network'],
    description:
      'Páginas del sitio sin Content-Security-Policy, Strict-Transport-Security, X-Content-Type-Options o protección contra iframes.',
  },
  'insecure-cookie': {
    title: 'Cookies sin protección',
    category: 'security',
    requires: ['network'],
    description: 'Cookies del sitio sin Secure, sin HttpOnly (las de sesión) o sin SameSite.',
  },
  'token-in-url': {
    title: 'Credenciales en la URL',
    category: 'security',
    requires: ['network'],
    description:
      'Parámetros como token, auth o session en la URL. Quedan en logs, en el historial y en el header Referer.',
  },
  'mixed-content': {
    title: 'Contenido mixto',
    category: 'security',
    requires: ['network'],
    description: 'Recursos pedidos por http:// desde una página https://.',
  },
  'server-disclosure': {
    title: 'Tecnología del servidor expuesta',
    category: 'security',
    requires: ['network'],
    description: 'Headers Server o X-Powered-By que revelan la tecnología y su versión.',
  },
  'a11y-violation': {
    title: 'Problemas de accesibilidad (WCAG)',
    category: 'accessibility',
    requires: ['accessibility'],
    description:
      'Cada pantalla se revisa con axe-core contra WCAG 2.x A y AA: textos alternativos, contraste, etiquetas de formularios, nombres de botones y enlaces, entre otros.',
  },
  'uncaught-exception': {
    title: 'Excepciones sin capturar',
    category: 'frontend',
    requires: ['console'],
    description: 'Errores de JavaScript que nadie capturó. Suelen dejar la pantalla a medias.',
  },
  'console-error': {
    title: 'Errores en consola',
    category: 'frontend',
    requires: ['console'],
    description: 'Mensajes console.error y errores del navegador, agrupados por texto.',
  },
  'console-warning': {
    title: 'Advertencias en consola',
    category: 'frontend',
    requires: ['console'],
    description: 'Mensajes console.warn y advertencias del navegador, agrupados por texto.',
  },
  'ws-protocol-error': {
    title: 'Errores en tiempo real',
    category: 'realtime',
    requires: ['websocket'],
    description: 'Errores dentro del protocolo del socket: connect_error de Socket.IO o respuestas SIP de error.',
  },
  'ws-reconnect-loop': {
    title: 'Reconexiones del socket',
    category: 'realtime',
    requires: ['websocket'],
    description: 'El mismo WebSocket se abrió 3 veces o más: la conexión se cae o el servidor la rechaza.',
  },
  'poor-web-vital': {
    title: 'Web Vitals fuera de umbral',
    category: 'performance',
    requires: ['performance'],
    description: 'LCP, CLS o INP por encima de lo que recomienda Google (necesita mejorar o malo).',
  },
  'long-task': {
    title: 'Bloqueos de la página',
    category: 'performance',
    requires: ['performance'],
    description: 'Tareas de JavaScript de 200 ms o más, que congelan la interfaz mientras duran.',
  },
};

/** Decisión del QA sobre un hallazgo: lo confirma (es un bug real) o lo descarta (falso positivo, esperado). */
export const findingDecisionSchema = z.enum(['confirmed', 'dismissed']);
export type FindingDecisionValue = z.infer<typeof findingDecisionSchema>;

export const findingDecisionRecordSchema = z.object({
  decision: findingDecisionSchema,
  decidedAt: z.iso.datetime(),
  note: z.string().trim().max(500).optional(),
});
export type FindingDecisionRecord = z.infer<typeof findingDecisionRecordSchema>;

export const findingSchema = z.object({
  /** Estable entre análisis de la misma sesión (sirve para confirmar o descartar después). */
  id: z.string(),
  ruleId: ruleIdSchema,
  /** Quién lo encontró. Por ahora solo las reglas fijas; los agentes llegan después. */
  source: z.literal('rule'),
  category: findingCategorySchema,
  severity: findingSeveritySchema,
  title: z.string(),
  /** Qué se vio afectado: "POST /api/auth", un origen, una cookie… */
  subject: z.string().optional(),
  detail: z.string(),
  recommendation: z.string().optional(),
  occurrences: z.number().int().positive(),
  firstAt: z.number().nonnegative(),
  lastAt: z.number().nonnegative(),
  /** Eventos que lo prueban, en orden; el primero es el principal. */
  evidence: z.array(z.string()).min(1),
  /** Acción del usuario justo antes del primer evento (hasta 3 s antes). */
  afterAction: z
    .object({ eventId: z.string(), label: z.string(), t: z.number().nonnegative() })
    .optional(),
  /** La evidencia cae en algo que el objetivo dejó fuera del alcance. */
  outOfScope: z.boolean(),
  /** El QA ya lo revisó. Ausente si nadie lo decidió todavía. */
  decision: findingDecisionRecordSchema.optional(),
});
export type Finding = z.infer<typeof findingSchema>;

export const sessionAnalysisSchema = z.object({
  sessionId: z.string(),
  generatedAt: z.iso.datetime(),
  rulesRun: z.number().int().nonnegative(),
  /** Reglas que no corrieron porque su canal no se capturó. */
  skipped: z.array(z.object({ ruleId: ruleIdSchema, reason: z.string() })),
  findings: z.array(findingSchema),
});
export type SessionAnalysis = z.infer<typeof sessionAnalysisSchema>;

export const FINDING_SEVERITY_LABELS: Record<FindingSeverity, string> = {
  critical: 'Crítico',
  high: 'Alto',
  medium: 'Medio',
  low: 'Bajo',
};

export const FINDING_CATEGORY_LABELS: Record<FindingCategory, string> = {
  functional: 'Funcional',
  network: 'Red',
  security: 'Seguridad',
  accessibility: 'Accesibilidad',
  frontend: 'Front-end',
  realtime: 'Tiempo real',
  performance: 'Rendimiento',
};

const SEVERITY_RANK: Record<FindingSeverity, number> = { critical: 0, high: 1, medium: 2, low: 3 };

/** Orden de lectura: primero lo más grave y, a igual gravedad, lo que pasó antes. */
export function compareFindings(a: Finding, b: Finding): number {
  return SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || a.firstAt - b.firstAt;
}
