import type { CaptureEvent, SessionAnalysis, SessionReview } from '@rastro/shared';
import { describe, expect, it } from 'vitest';
import { apiDigest, EvidenceRefs, frontendDigest, sharedBrief } from '../../src/application/agents/brief.js';
import { Session } from '../../src/domain/session/Session.js';
import { sampleInput } from '../samples.js';

const session = {
  ...Session.create({ id: 'ses_1', now: new Date('2026-09-14T10:00:00Z'), ...sampleInput() }).toDto(),
  status: 'completed' as const,
  startedAt: '2026-09-14T10:00:00.000Z',
  endedAt: '2026-09-14T10:00:30.000Z',
};

const base = { pageId: 'p1' };
const events: CaptureEvent[] = [
  { ...base, id: 'nav', t: 100, kind: 'navigation', url: 'https://qa.mercadito.test/checkout' },
  { ...base, id: 'act', t: 1000, kind: 'user-action', action: 'click', selector: 'button', label: 'Pagar', viewport: { w: 1280, h: 720 } },
  {
    ...base,
    id: 'req',
    t: 1100,
    kind: 'http-request',
    requestId: 'q1',
    method: 'POST',
    url: 'https://qa.mercadito.test/api/orders',
    resourceType: 'Fetch',
    headers: {},
    postData: '{"amount":10}',
  },
  {
    ...base,
    id: 'res',
    t: 1400,
    kind: 'http-response',
    requestId: 'q1',
    status: 500,
    statusText: '',
    mimeType: 'application/json',
    headers: {},
    body: '{"error":"PAYMENT_TIMEOUT"}',
  },
  { ...base, id: 'fin', t: 1400, kind: 'http-finished', requestId: 'q1', encodedDataLength: 10, durationMs: 300 },
  { ...base, id: 'exc', t: 1500, kind: 'exception', message: 'TypeError: order is undefined', stack: 'TypeError: x\n    at render (app.js:1:1)' },
  {
    ...base,
    id: 'scan',
    t: 3000,
    kind: 'a11y-scan',
    url: 'https://qa.mercadito.test/checkout',
    durationMs: 300,
    passes: 10,
    violations: [
      {
        id: 'select-name',
        impact: 'critical',
        help: 'Select element must have an accessible name',
        description: '',
        helpUrl: '',
        tags: [],
        nodeCount: 1,
        nodes: [],
      },
    ],
  },
];

const analysis: SessionAnalysis = {
  sessionId: 'ses_1',
  generatedAt: '2026-09-14T10:01:00.000Z',
  rulesRun: 20,
  skipped: [],
  findings: [
    {
      id: 'f1',
      ruleId: 'http-server-error',
      source: 'rule',
      category: 'network',
      severity: 'critical',
      title: 'El servidor falló (500) en POST /api/orders',
      detail: 'Respondió 500 1 vez.',
      occurrences: 1,
      firstAt: 1100,
      lastAt: 1100,
      evidence: ['req'],
      outOfScope: false,
    },
    {
      id: 'f2',
      ruleId: 'console-warning',
      source: 'rule',
      category: 'frontend',
      severity: 'low',
      title: 'Advertencia en consola: deprecado',
      detail: 'Apareció 1 vez.',
      occurrences: 1,
      firstAt: 200,
      lastAt: 200,
      evidence: ['nav'],
      outOfScope: false,
      decision: { decision: 'dismissed', decidedAt: '2026-09-14T10:02:00.000Z' },
    },
  ],
};

const review: SessionReview = {
  criteria: { CA1: { verdict: 'fail', note: 'Devuelve 500', updatedAt: '2026-09-14T10:03:00.000Z' } },
  markers: [{ id: 'm1', t: 1000, criterionId: 'CA1', note: 'Se ve el error', createdAt: '2026-09-14T10:00:01.000Z' }],
};

describe('EvidenceRefs', () => {
  it('da referencias cortas estables y descarta las inventadas', () => {
    const refs = new EvidenceRefs();
    expect([refs.ref('a'), refs.ref('b'), refs.ref('a')]).toEqual(['E1', 'E2', 'E1']);
    expect(refs.resolve(['e2', 'E1', 'E9', 'E1'])).toEqual(['b', 'a']);
  });
});

describe('resumen para los agentes', () => {
  it('lleva objetivo, criterios con lo que decidió el QA, hallazgos con evidencia y recorrido', () => {
    const refs = new EvidenceRefs();
    const brief = sharedBrief({ session, review, analysis, events }, refs);
    expect(brief).toContain('- CA1: Un pago aprobado crea un pedido en estado Pagado.');
    expect(brief).toContain('Veredicto del QA: No cumple — Devuelve 500');
    expect(brief).toContain('Marcas del QA: 00:01.0 «Se ve el error»');
    expect(brief).toContain('[Crítico] El servidor falló (500) en POST /api/orders');
    expect(brief).toContain('Evidencia: E1');
    expect(refs.resolve(['E1'])).toEqual(['req']);
    expect(brief).toContain('El QA descartó como falsos positivos: Advertencia en consola: deprecado');
    expect(brief).toContain('Click en «Pagar»');
    expect(brief).toContain('Duración: 30,0 s');
  });

  it('el agente API REST recibe las llamadas agrupadas, con lo enviado y la respuesta de error', () => {
    const digest = apiDigest(session, events, new EvidenceRefs());
    expect(digest).toContain('POST /api/orders · 1 llamada · status 500');
    expect(digest).toContain('Enviado: {"amount":10}');
    expect(digest).toContain('Respuesta (500): {"error":"PAYMENT_TIMEOUT"}');
    expect(digest).toContain('No hubo conexiones WebSocket.');
  });

  it('el agente Front-end recibe excepciones y accesibilidad en español', () => {
    const digest = frontendDigest(events, new EvidenceRefs());
    expect(digest).toContain('TypeError: order is undefined (1×)');
    expect(digest).toContain('at render (app.js:1:1)');
    expect(digest).toContain('Los elementos select deben tener un nombre accesible [critical] ×1');
  });
});
