import type { CaptureEvent } from '@rastro/shared';
import { describe, expect, it } from 'vitest';
import { buildTimeline } from './buildTimeline';
import { applyFilters, collectProblems, DEFAULT_FILTERS, isDefaultFilters, itemsAt, requestLaunches } from './filterTimeline';

const base = { pageId: 'p1' };
const model = buildTimeline([
  { ...base, id: 'a1', t: 100, kind: 'user-action', action: 'click', selector: '#login', label: 'Ingresar', viewport: { w: 1, h: 1 } },
  { ...base, id: 'r1', t: 200, kind: 'http-request', requestId: 'q1', method: 'POST', url: 'https://qa.test/api/auth', resourceType: 'Fetch', headers: {} },
  { ...base, id: 'r2', t: 400, kind: 'http-response', requestId: 'q1', status: 401, statusText: 'Unauthorized', mimeType: 'application/json', headers: {} },
  { ...base, id: 'r3', t: 1400, kind: 'http-finished', requestId: 'q1', encodedDataLength: 10, durationMs: 1200 },
  { ...base, id: 'c1', t: 450, kind: 'console', level: 'error', text: 'Login falló' },
  { ...base, id: 'c2', t: 5000, kind: 'console', level: 'log', text: 'render' },
  { ...base, id: 'w1', t: 600, kind: 'ws-frame', requestId: 's1', direction: 'received', opcode: 1, payload: '44{"message":"not authorized"}', truncated: false },
] satisfies CaptureEvent[]);

const lane = (m: ReturnType<typeof applyFilters>, id: string) => m.lanes.find((item) => item.id === id);

describe('filtros de la línea de tiempo', () => {
  it('sin filtros deja todo igual', () => {
    expect(isDefaultFilters(DEFAULT_FILTERS)).toBe(true);
    expect(lane(applyFilters(model, DEFAULT_FILTERS), 'console')?.items).toHaveLength(2);
  });

  it('separa errores de avisos', () => {
    const errors = applyFilters(model, { ...DEFAULT_FILTERS, severity: 'errors' });
    const warnings = applyFilters(model, { ...DEFAULT_FILTERS, severity: 'warnings' });
    expect(lane(errors, 'console')?.items.map((item) => item.eventId)).toEqual(['c1']);
    expect(lane(errors, 'network')?.items).toHaveLength(0);
    expect(lane(warnings, 'network')?.items.map((item) => item.eventId)).toEqual(['r1']);
  });

  it('oculta carriles y busca por texto', () => {
    const filtered = applyFilters(model, { ...DEFAULT_FILTERS, lanes: new Set(['network']), query: 'AUTH' });
    expect(filtered.lanes.map((item) => item.id)).toEqual(['network']);
    expect(lane(filtered, 'network')?.items).toHaveLength(1);
  });
});

describe('collectProblems', () => {
  it('devuelve errores y avisos por separado, con su carril', () => {
    const { errors, warnings } = collectProblems(model);
    expect(errors.map((problem) => [problem.eventId, problem.laneLabel])).toEqual([
      ['c1', 'CONSOLA'],
      ['w1', 'WEBSOCKET'],
    ]);
    expect(warnings.map((problem) => problem.eventId)).toEqual(['r1']);
  });
});

describe('requestLaunches', () => {
  const burst = buildTimeline(
    Array.from({ length: 10 }, (_, index) => ({
      ...base,
      id: `b${index}`,
      t: 10_000 + index * 20,
      kind: 'http-request' as const,
      requestId: `rb${index}`,
      method: 'GET',
      url: `https://qa.test/api/item/${index}`,
      resourceType: 'Fetch',
      headers: {},
    })),
  );

  it('cuenta las peticiones lanzadas en el tramo, en el momento en que salen', () => {
    const bins = requestLaunches(burst, 1000);
    expect(bins).toHaveLength(1);
    // El tramo termina donde termina la sesión (10,18 s), no más allá.
    expect(bins[0]).toMatchObject({ start: 10_000, end: 10_180, count: 10, firstAt: 10_000 });
  });

  it('solo cuenta peticiones HTTP, no clicks ni logs', () => {
    expect(requestLaunches(model, 1000).map((bin) => bin.count)).toEqual([1]);
  });

  it('sin el carril de red visible no cuenta nada', () => {
    const withoutNetwork = applyFilters(model, { ...DEFAULT_FILTERS, lanes: new Set(['console']) });
    expect(requestLaunches(withoutNetwork, 1000)).toEqual([]);
  });
});

describe('itemsAt', () => {
  it('encuentra los eventos cercanos y las requests en curso', () => {
    // A los 1000 ms la request r1 (200 → 1400 ms) sigue en curso; c1 y w1 quedaron atrás.
    expect(itemsAt(model, 1000, 300).map((item) => item.eventId)).toEqual(['r1']);
    expect(itemsAt(model, 5100, 300).map((item) => item.eventId)).toEqual(['c2']);
  });

  it('con la ventana por defecto incluye lo ocurrido hasta 600 ms antes', () => {
    expect(itemsAt(model, 1000).map((item) => item.eventId).sort()).toEqual(['c1', 'r1', 'w1']);
  });
});
