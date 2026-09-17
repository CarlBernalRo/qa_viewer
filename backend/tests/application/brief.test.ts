import type { CaptureEvent, SessionAnalysis, SessionReview } from '@rastro/shared';
import { describe, expect, it } from 'vitest';
import {
  a11yDigest,
  apiDigest,
  envDigest,
  EvidenceRefs,
  frontendDigest,
  funcDigest,
  perfDigest,
  realtimeDigest,
  securityDigest,
  sharedBrief,
} from '../../src/application/agents/brief.js';
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

  it('el agente API REST recibe las llamadas HTTP agrupadas, con lo enviado y la respuesta de error', () => {
    const digest = apiDigest(session, events, new EvidenceRefs());
    expect(digest).toContain('POST /api/orders · 1 llamada · status 500');
    expect(digest).toContain('Enviado: {"amount":10}');
    expect(digest).toContain('Respuesta (500): {"error":"PAYMENT_TIMEOUT"}');
    expect(digest).not.toContain('WebSocket'); // eso es del agente Tiempo real, no de API REST
  });

  it('el agente Tiempo real recibe las conversaciones de WebSocket y SSE', () => {
    const digest = realtimeDigest(session, events, new EvidenceRefs());
    expect(digest).toContain('## WebSocket y SSE');
    expect(digest).toContain('No hubo conexiones.');
  });

  it('el agente Front-end recibe excepciones y consola, sin accesibilidad ni rendimiento', () => {
    const digest = frontendDigest(events, new EvidenceRefs());
    expect(digest).toContain('TypeError: order is undefined (1×)');
    expect(digest).toContain('at render (app.js:1:1)');
    expect(digest).not.toContain('Accesibilidad');
    expect(digest).not.toContain('Rendimiento');
  });

  it('el agente Accesibilidad recibe las violaciones de axe-core en español', () => {
    const digest = a11yDigest(events, new EvidenceRefs());
    expect(digest).toContain('Los elementos select deben tener un nombre accesible [critical] ×1');
  });

  it('el agente Rendimiento recibe Web Vitals y bloqueos largos', () => {
    const perfEvents: CaptureEvent[] = [
      ...events,
      { ...base, id: 'lcp', t: 500, kind: 'web-vital', name: 'LCP', value: 2600 },
      { ...base, id: 'task', t: 600, kind: 'web-vital', name: 'long-task', value: 300 },
    ];
    const digest = perfDigest(perfEvents, new EvidenceRefs());
    expect(digest).toContain('LCP 2,6 s');
    expect(digest).toContain('Bloqueos de 200 ms o más: 300 ms');
  });

  it('el agente Funcional une cada acción con lo que pasó justo después', () => {
    const digest = funcDigest(events, new EvidenceRefs());
    expect(digest).toContain('Click en «Pagar» → 1 request');
  });

  it('el agente Ambiente recibe headers y menciones de versión', () => {
    const envEvents: CaptureEvent[] = [
      ...events,
      {
        ...base,
        id: 'env-req',
        t: 10,
        kind: 'http-request',
        requestId: 'env',
        method: 'GET',
        url: 'https://qa.mercadito.test/',
        resourceType: 'Document',
        headers: {},
      },
      {
        ...base,
        id: 'env-res',
        t: 20,
        kind: 'http-response',
        requestId: 'env',
        status: 200,
        statusText: '',
        mimeType: 'text/html',
        headers: { 'x-app-version': '2.14.0' },
        body: '',
      },
      { ...base, id: 'env-fin', t: 25, kind: 'http-finished', requestId: 'env', encodedDataLength: 5, durationMs: 10 },
    ];
    const digest = envDigest(session, envEvents, new EvidenceRefs());
    expect(digest).toContain('x-app-version: 2.14.0');
  });

  it('el agente Seguridad recibe headers, cookies y credenciales en la URL, en bruto', () => {
    const securityEvents: CaptureEvent[] = [
      ...events,
      {
        ...base,
        id: 'doc-req',
        t: 50,
        kind: 'http-request',
        requestId: 'doc',
        method: 'GET',
        url: 'https://qa.mercadito.test/checkout',
        resourceType: 'Document',
        headers: {},
      },
      {
        ...base,
        id: 'doc-res',
        t: 90,
        kind: 'http-response',
        requestId: 'doc',
        status: 200,
        statusText: '',
        mimeType: 'text/html',
        headers: { 'set-cookie': 'session=abc123; HttpOnly', server: 'nginx/1.18.0' },
        body: '',
      },
      { ...base, id: 'doc-fin', t: 95, kind: 'http-finished', requestId: 'doc', encodedDataLength: 10, durationMs: 40 },
      {
        ...base,
        id: 'tok-req',
        t: 200,
        kind: 'http-request',
        requestId: 'tok',
        method: 'GET',
        url: 'https://qa.mercadito.test/api/status?access_token=abc',
        resourceType: 'Fetch',
        headers: {},
      },
      {
        ...base,
        id: 'tok-res',
        t: 210,
        kind: 'http-response',
        requestId: 'tok',
        status: 200,
        statusText: '',
        mimeType: 'application/json',
        headers: {},
        body: '',
      },
      { ...base, id: 'tok-fin', t: 215, kind: 'http-finished', requestId: 'tok', encodedDataLength: 5, durationMs: 15 },
    ];
    const digest = securityDigest(session, securityEvents, new EvidenceRefs());
    expect(digest).toContain('server: nginx/1.18.0');
    expect(digest).toContain('session [HttpOnly]');
    expect(digest).toContain('«access_token» en GET /api/status');
    expect(digest).toContain('## Contenido servido por http:// en una página https://\nNinguno.');
  });
});
