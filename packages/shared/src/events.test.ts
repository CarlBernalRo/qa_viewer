import { describe, expect, it } from 'vitest';
import { captureEventSchema, channelOf, cleanAxeText, isErrorEvent, type CaptureEvent } from './events.js';

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
    expect(channelOf('a11y-scan')).toBe('accessibility');
  });
});

describe('cleanAxeText', () => {
  it('quita los restos de plantilla de axe y conserva el texto útil', () => {
    const raw = "Corregir (todas) las siguientes incidencias:{{~it:value}}\n  {{=value.split('\\n').join('\\n  ')}}{{~}}";
    expect(cleanAxeText(raw)).toBe('Corregir (todas) las siguientes incidencias:');
    expect(cleanAxeText('Corrija lo siguiente:\n  Falta alt  \n\n  Otra cosa')).toBe('Corrija lo siguiente:\n  Falta alt\n  Otra cosa');
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

  it('cuenta como error un connect_error de Socket.IO', () => {
    const frame: CaptureEvent = {
      ...base,
      kind: 'ws-frame',
      requestId: 's1',
      direction: 'received',
      opcode: 1,
      payload: '44{"message":"not authorized"}',
      truncated: false,
    };
    expect(isErrorEvent(frame)).toBe(true);
    expect(isErrorEvent({ ...frame, payload: '42["ping",{}]' })).toBe(false);
  });
});
