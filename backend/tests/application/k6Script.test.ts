import type { CaptureEvent } from '@rastro/shared';
import { describe, expect, it } from 'vitest';
import { generateK6Script } from '../../src/application/reports/k6Script.js';
import { Session } from '../../src/domain/session/Session.js';
import { sampleInput } from '../samples.js';

const session = Session.create({ id: 'ses_1', now: new Date('2026-09-14T10:00:00Z'), ...sampleInput() }).toDto();

const base = { pageId: 'p1' };

describe('generateK6Script', () => {
  it('genera un request por endpoint propio, en orden, con check y sleep', () => {
    const events: CaptureEvent[] = [
      {
        ...base,
        id: 'req1',
        t: 200,
        kind: 'http-request',
        requestId: 'q1',
        method: 'POST',
        url: 'https://qa.mercadito.test/api/pay',
        resourceType: 'Fetch',
        headers: {},
        postData: '{"amount":10}',
      },
      {
        ...base,
        id: 'req0',
        t: 100,
        kind: 'http-request',
        requestId: 'q0',
        method: 'GET',
        url: 'https://qa.mercadito.test/api/orders',
        resourceType: 'XHR',
        headers: {},
      },
      // Un tercero (analytics) no debe aparecer.
      {
        ...base,
        id: 'req2',
        t: 150,
        kind: 'http-request',
        requestId: 'q2',
        method: 'GET',
        url: 'https://analytics.example.com/collect',
        resourceType: 'Fetch',
        headers: {},
      },
    ];
    const script = generateK6Script(session, events);
    expect(script).toContain("import http from 'k6/http';");
    expect(script).toContain('http.get("https://qa.mercadito.test/api/orders"');
    expect(script).toContain('http.post("https://qa.mercadito.test/api/pay", "{\\"amount\\":10}"');
    expect(script).not.toContain('analytics.example.com');
    // El GET (t=100) va antes que el POST (t=200).
    expect(script.indexOf('/api/orders')).toBeLessThan(script.indexOf('/api/pay'));
    expect(script).toContain("check(res0, { 'status es 2xx o 3xx'");
  });

  it('sin llamadas a la API propia, deja el script vacío pero válido', () => {
    const script = generateK6Script(session, []);
    expect(script).toContain('No se registraron llamadas a la API del propio sitio en esta sesión.');
    expect(script).toContain('export default function () {');
  });
});
