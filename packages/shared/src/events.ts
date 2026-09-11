import { z } from 'zod';
import type { CaptureChannel } from './session.js';

const rectSchema = z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() });
export type Rect = z.infer<typeof rectSchema>;

const headersSchema = z.record(z.string(), z.string());

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
    default:
      return false;
  }
}
