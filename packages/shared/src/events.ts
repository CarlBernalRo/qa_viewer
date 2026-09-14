import { z } from 'zod';
import type { CaptureChannel } from './session.js';
import { decodeWsPayload } from './websocket.js';

const rectSchema = z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() });
export type Rect = z.infer<typeof rectSchema>;

const headersSchema = z.record(z.string(), z.string());

export const a11yImpactSchema = z.enum(['minor', 'moderate', 'serious', 'critical']);
export type A11yImpact = z.infer<typeof a11yImpactSchema>;

/** Una regla de axe-core que falló en una pantalla, con algunos de los elementos afectados. */
export const a11yViolationSchema = z.object({
  id: z.string().max(100),
  impact: a11yImpactSchema.nullable(),
  help: z.string().max(500),
  description: z.string().max(1000),
  helpUrl: z.string().max(500),
  tags: z.array(z.string().max(60)).max(40),
  /** Total de elementos afectados; `nodes` trae solo los primeros. */
  nodeCount: z.number().int().nonnegative(),
  nodes: z
    .array(
      z.object({
        target: z.string().max(1000),
        html: z.string().max(1000),
        summary: z.string().max(2000).optional(),
        rect: rectSchema.optional(),
      }),
    )
    .max(20),
});
export type A11yViolation = z.infer<typeof a11yViolationSchema>;

/**
 * Algunos textos de axe-core en español traen restos de plantillas sin procesar
 * (`{{~it:value}}…{{~}}`). Se quitan conservando los saltos de línea.
 */
export function cleanAxeText(text: string): string {
  return text
    .replace(/\{\{[\s\S]*?\}\}/g, '')
    .replace(/[ \t]+(?=\n|$)/g, '')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

/** Campos comunes: `t` son milisegundos desde el inicio de la grabación. */
const base = {
  id: z.string(),
  t: z.number().nonnegative(),
  pageId: z.string(),
};

export const captureEventSchema = z.discriminatedUnion('kind', [
  z.object({ ...base, kind: z.literal('navigation'), url: z.string() }),
  z.object({
    ...base,
    kind: z.literal('user-action'),
    action: z.enum(['click', 'input', 'change', 'submit', 'keydown']),
    selector: z.string(),
    label: z.string().optional(),
    value: z.string().optional(),
    key: z.string().optional(),
    rect: rectSchema.optional(),
    viewport: z.object({ w: z.number(), h: z.number() }),
  }),
  z.object({
    ...base,
    kind: z.literal('http-request'),
    requestId: z.string(),
    method: z.string(),
    url: z.string(),
    resourceType: z.string(),
    headers: headersSchema,
    postData: z.string().optional(),
  }),
  z.object({
    ...base,
    kind: z.literal('http-response'),
    requestId: z.string(),
    status: z.number().int(),
    statusText: z.string(),
    mimeType: z.string(),
    headers: headersSchema,
    body: z.string().optional(),
    bodyTruncated: z.boolean().optional(),
  }),
  z.object({
    ...base,
    kind: z.literal('http-finished'),
    requestId: z.string(),
    encodedDataLength: z.number(),
    durationMs: z.number(),
  }),
  z.object({
    ...base,
    kind: z.literal('http-failed'),
    requestId: z.string(),
    errorText: z.string(),
    canceled: z.boolean(),
  }),
  z.object({ ...base, kind: z.literal('ws-open'), requestId: z.string(), url: z.string() }),
  z.object({
    ...base,
    kind: z.literal('ws-frame'),
    requestId: z.string(),
    direction: z.enum(['sent', 'received']),
    opcode: z.number().int(),
    payload: z.string(),
    truncated: z.boolean(),
  }),
  z.object({ ...base, kind: z.literal('ws-close'), requestId: z.string() }),
  z.object({
    ...base,
    kind: z.literal('sse-message'),
    requestId: z.string(),
    eventName: z.string(),
    data: z.string(),
  }),
  z.object({
    ...base,
    kind: z.literal('console'),
    level: z.enum(['debug', 'log', 'info', 'warn', 'error']),
    text: z.string(),
    source: z.string().optional(),
  }),
  z.object({
    ...base,
    kind: z.literal('exception'),
    message: z.string(),
    stack: z.string().optional(),
  }),
  z.object({
    ...base,
    kind: z.literal('web-vital'),
    name: z.enum(['LCP', 'CLS', 'INP', 'long-task']),
    value: z.number(),
  }),
  z.object({
    ...base,
    kind: z.literal('a11y-scan'),
    /** Pantalla revisada. `t` es cuando terminó la revisión; empezó `durationMs` antes. */
    url: z.string(),
    durationMs: z.number().nonnegative(),
    /** Reglas de axe-core que la pantalla cumple. */
    passes: z.number().int().nonnegative(),
    violations: z.array(a11yViolationSchema),
  }),
]);

export type CaptureEvent = z.infer<typeof captureEventSchema>;
export type CaptureEventKind = CaptureEvent['kind'];
export type CaptureEventOf<K extends CaptureEventKind> = Extract<CaptureEvent, { kind: K }>;

/** Evento sin los campos que asigna el backend al registrarlo. */
export type RawCaptureEvent = CaptureEvent extends infer E
  ? E extends CaptureEvent
    ? Omit<E, 'id' | 't'>
    : never
  : never;

const CHANNEL_BY_KIND: Record<CaptureEventKind, CaptureChannel> = {
  navigation: 'actions',
  'user-action': 'actions',
  'http-request': 'network',
  'http-response': 'network',
  'http-finished': 'network',
  'http-failed': 'network',
  'ws-open': 'websocket',
  'ws-frame': 'websocket',
  'ws-close': 'websocket',
  'sse-message': 'websocket',
  console: 'console',
  exception: 'console',
  'web-vital': 'performance',
  'a11y-scan': 'accessibility',
};

export function channelOf(kind: CaptureEventKind): CaptureChannel {
  return CHANNEL_BY_KIND[kind];
}

export function isErrorEvent(event: CaptureEvent): boolean {
  switch (event.kind) {
    case 'exception':
    case 'http-failed':
      return true;
    case 'console':
      return event.level === 'error';
    case 'http-response':
      return event.status >= 500;
    case 'ws-frame':
      // Errores dentro del protocolo del socket: connect_error de Socket.IO, respuestas SIP de error.
      return decodeWsPayload(event.payload).isError;
    default:
      return false;
  }
}
