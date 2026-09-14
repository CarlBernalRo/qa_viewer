import type { CaptureEvent } from '@rastro/shared';
import { describe, expect, it } from 'vitest';
import { buildTimeline } from './buildTimeline';

const base = { pageId: 'p1' };
const events: CaptureEvent[] = [
  { ...base, id: 'n1', t: 0, kind: 'navigation', url: 'https://qa.test/checkout/pago' },
  { ...base, id: 'a1', t: 1200, kind: 'user-action', action: 'click', selector: '#pay', label: 'Confirmar pago', viewport: { w: 1366, h: 768 } },
  { ...base, id: 'r1', t: 1300, kind: 'http-request', requestId: 'q1', method: 'POST', url: 'https://qa.test/api/orders', resourceType: 'Fetch', headers: {} },
  { ...base, id: 'r2', t: 3100, kind: 'http-response', requestId: 'q1', status: 500, statusText: 'Internal Server Error', mimeType: 'application/json', headers: {} },
  { ...base, id: 'r3', t: 3140, kind: 'http-finished', requestId: 'q1', encodedDataLength: 120, durationMs: 1840 },
  { ...base, id: 'c1', t: 3200, kind: 'exception', message: 'TypeError: order is null' },
  { ...base, id: 'v1', t: 3300, kind: 'web-vital', name: 'INP', value: 620 },
];

describe('buildTimeline', () => {
  const model = buildTimeline(events);
  const lane = (id: string) => model.lanes.find((item) => item.id === id);

  it('arma la request con su status, duración y severidad', () => {
    const [request] = lane('network')?.items ?? [];
    expect(request).toMatchObject({ eventId: 'r1', start: 1300, end: 3140, severity: 'error' });
    expect(request?.label).toBe('POST /api/orders → 500');
    expect(model.requests.get('q1')?.response?.status).toBe(500);
  });

  it('pone cada evento en su carril', () => {
    expect(lane('actions')?.items[0]?.label).toBe('Click en Confirmar pago');
    expect(lane('console')?.items[0]?.severity).toBe('error');
    expect(lane('performance')?.items[0]?.severity).toBe('warn');
  });

  it('calcula la duración total incluyendo las requests', () => {
    expect(model.durationMs).toBe(3300);
  });
});
