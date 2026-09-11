import { describe, expect, it } from 'vitest';
import { captureEventSchema, channelOf, isErrorEvent, type CaptureEvent } from './events.js';

const base = { id: 'e1', t: 10, pageId: 'p1' };

describe('captureEventSchema', () => {
  it('acepta una respuesta HTTP válida', () => {
    const parsed = captureEventSchema.parse({
      ...base,
      kind: 'http-response',
      requestId: 'r1',
      status: 500,
      statusText: 'Internal Server Error',
      mimeType: 'application/json',
      headers: {},
    });
    expect(parsed.kind).toBe('http-response');
  });

  it('rechaza un tipo de evento desconocido', () => {
    expect(() => captureEventSchema.parse({ ...base, kind: 'telepatia' })).toThrow();
  });
});

describe('channelOf', () => {
  it('asigna cada tipo de evento a su canal', () => {
    expect(channelOf('ws-frame')).toBe('websocket');
    expect(channelOf('user-action')).toBe('actions');
    expect(channelOf('exception')).toBe('console');
  });
});

describe('isErrorEvent', () => {
  it('marca como error los 5xx, las excepciones y console.error', () => {
    const response: CaptureEvent = {
      ...base,
      kind: 'http-response',
      requestId: 'r1',
      status: 503,
      statusText: '',
      mimeType: '',
      headers: {},
    };
    const warn: CaptureEvent = { ...base, kind: 'console', level: 'warn', text: 'ojo' };
    expect(isErrorEvent(response)).toBe(true);
    expect(isErrorEvent({ ...base, kind: 'exception', message: 'boom' })).toBe(true);
    expect(isErrorEvent(warn)).toBe(false);
  });
});
