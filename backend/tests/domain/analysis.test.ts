import {
  ALL_CAPTURE_CHANNELS,
  type A11yViolation,
  type CaptureEvent,
  type CreateSessionInput,
  type RuleId,
  type SessionAnalysis,
} from '@rastro/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { analyzeSession } from '../../src/domain/analysis/analyzeSession.js';
import { REDACTED } from '../../src/domain/redaction/Redactor.js';
import { sampleInput } from '../samples.js';

const SITE = 'https://qa.mercadito.test';
let seq = 0;

beforeEach(() => {
  seq = 0;
});

function at(t: number) {
  seq += 1;
  return { id: `e${seq}`, t, pageId: 'p1' };
}

interface CallOptions {
  status?: number;
  type?: string;
  body?: string;
  headers?: Record<string, string>;
  duration?: number;
  mime?: string;
  postData?: string;
}

/** Request + respuesta + fin, como las emite el colector de red. */
function call(t: number, method: string, url: string, options: CallOptions = {}): CaptureEvent[] {
  const { status = 200, type = 'Fetch', body, headers = {}, duration = 120, mime = 'application/json', postData } = options;
  const request = at(t);
  const requestId = `q${request.id}`;
  return [
    { ...request, kind: 'http-request', requestId, method, url, resourceType: type, headers: {}, ...(postData ? { postData } : {}) },
    {
      ...at(t + duration),
      kind: 'http-response',
      requestId,
      status,
      statusText: '',
      mimeType: mime,
      headers,
      ...(body !== undefined ? { body } : {}),
    },
    { ...at(t + duration), kind: 'http-finished', requestId, encodedDataLength: 800, durationMs: duration },
  ];
}

const click = (t: number, label: string): CaptureEvent => ({
  ...at(t),
  kind: 'user-action',
  action: 'click',
  selector: 'button',
  label,
  viewport: { w: 1280, h: 800 },
});

function analyze(events: CaptureEvent[], input: CreateSessionInput = sampleInput()): SessionAnalysis {
  return analyzeSession({
    sessionId: 'ses_1',
    now: new Date('2026-09-14T10:00:00.000Z'),
    objective: input.objective,
    capture: input.capture,
    events,
  });
}

const byRule = (analysis: SessionAnalysis, ruleId: RuleId) =>
  analysis.findings.filter((finding) => finding.ruleId === ruleId);
const bySubject = (analysis: SessionAnalysis, subject: string) =>
  analysis.findings.find((finding) => finding.subject === subject);

describe('reglas de red', () => {
  it('agrupa los 5xx por endpoint y marca como crítico un envío que falló después de un click', () => {
    const analysis = analyze([
      click(1000, 'Pagar'),
      ...call(1500, 'POST', `${SITE}/api/orders/881`, { status: 500, body: '{"message":"Stock insuficiente"}' }),
      ...call(9000, 'POST', `${SITE}/api/orders/882`, { status: 502 }),
    ]);
    const findings = byRule(analysis, 'http-server-error');
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      severity: 'critical',
      subject: 'POST /api/orders/:id',
      occurrences: 2,
      afterAction: { label: 'Click en «Pagar»' },
    });
    expect(findings[0]?.title).toContain('500, 502');
    expect(findings[0]?.detail).toContain('«Stock insuficiente»');
  });

  it('distingue la falta de autorización y baja un nivel lo que es de terceros', () => {
    const analysis = analyze([
      ...call(100, 'GET', `${SITE}/api/profile`, { status: 401 }),
      ...call(200, 'GET', 'https://analytics.otro.test/collect', { status: 400 }),
    ]);
    const profile = bySubject(analysis, 'GET /api/profile');
    expect(profile?.title).toBe('Sin autorización (401) en GET /api/profile');
    expect(profile?.severity).toBe('medium');
    expect(bySubject(analysis, 'GET analytics.otro.test/collect')?.severity).toBe('low');
  });

  it('detecta el falso éxito: 200 con errores de GraphQL', () => {
    const analysis = analyze([
      ...call(100, 'POST', `${SITE}/graphql`, { body: JSON.stringify({ data: null, errors: [{ message: 'No autorizado' }] }) }),
      ...call(300, 'GET', `${SITE}/api/ok`, { body: JSON.stringify({ error: null, items: [] }) }),
    ]);
    const findings = byRule(analysis, 'error-in-success');
    expect(findings).toHaveLength(1);
    expect(findings[0]?.severity).toBe('high');
    expect(findings[0]?.detail).toContain('No autorizado');
  });

  it('marca un envío duplicado en menos de 1 s y una consulta repetida 3 veces en 2 s', () => {
    const post = { postData: '{"id":1}' };
    const analysis = analyze([
      ...call(1000, 'POST', `${SITE}/api/orders`, post),
      ...call(1400, 'POST', `${SITE}/api/orders`, post),
      ...call(5000, 'GET', `${SITE}/api/cart`),
      ...call(5500, 'GET', `${SITE}/api/cart`),
      ...call(6200, 'GET', `${SITE}/api/cart`),
      ...call(9000, 'GET', `${SITE}/api/stock`),
      ...call(12_000, 'GET', `${SITE}/api/stock`),
    ]);
    expect(byRule(analysis, 'duplicate-request').map((finding) => [finding.title, finding.severity])).toEqual([
      ['Envío duplicado: POST /api/orders', 'high'],
      ['Petición repetida: GET /api/cart', 'low'],
    ]);
  });

  it('marca las peticiones lentas sin contar el long-polling', () => {
    const analysis = analyze([
      ...call(0, 'GET', `${SITE}/api/report`, { duration: 4200 }),
      ...call(0, 'GET', `${SITE}/socket.io/?EIO=4&transport=polling`, { duration: 25_000 }),
    ]);
    const findings = byRule(analysis, 'slow-request');
    expect(findings.map((finding) => finding.subject)).toEqual(['GET /api/report']);
    expect(findings[0]?.detail).toContain('4,2 s');
  });
});

describe('reglas de seguridad', () => {
  it('revisa los headers de las páginas del sitio, no las de terceros', () => {
    const events = [
      ...call(0, 'GET', `${SITE}/checkout`, { type: 'Document', mime: 'text/html', headers: { 'X-Frame-Options': 'DENY' } }),
      ...call(10, 'GET', 'https://ads.otro.test/frame', { type: 'Document', mime: 'text/html' }),
    ];
    const findings = byRule(analyze(events), 'missing-security-headers');
    expect(findings).toHaveLength(1);
    expect(findings[0]?.subject).toBe(SITE);
    expect(findings[0]?.severity).toBe('medium');
    expect(findings[0]?.detail).toContain('Content-Security-Policy, Strict-Transport-Security');
    expect(findings[0]?.detail).not.toContain('frame-ancestors');
    expect(byRule(analyze(events, sampleInput({ environment: 'DEV' })), 'missing-security-headers')[0]?.severity).toBe('low');
  });

  it('revisa los atributos de las cookies aunque su valor esté oculto', () => {
    const analysis = analyze([
      ...call(0, 'POST', `${SITE}/api/login`, {
        headers: { 'set-cookie': `sessionid=${REDACTED}; Path=/\ntheme=${REDACTED}; Path=/; Secure; SameSite=Lax` },
      }),
    ]);
    expect(byRule(analysis, 'insecure-cookie').map((finding) => [finding.title, finding.severity])).toEqual([
      ['Cookie sessionid sin Secure ni HttpOnly ni SameSite', 'medium'],
    ]);
  });

  it('encuentra credenciales en la URL de una request y de un socket', () => {
    const analysis = analyze([
      ...call(0, 'GET', `${SITE}/api/files?access_token=${encodeURIComponent(REDACTED)}`),
      { ...at(100), kind: 'ws-open', requestId: 's1', url: 'wss://qa.mercadito.test/socket.io/?EIO=4&token=x' },
    ]);
    const findings = byRule(analysis, 'token-in-url');
    expect(findings.map((finding) => [finding.subject, finding.severity])).toEqual([
      ['GET /api/files', 'medium'],
      ['WS /socket.io/', 'low'],
    ]);
    expect(findings[0]?.detail).toContain('quedó oculto');
  });
});

describe('reglas de tiempo real, front-end y rendimiento', () => {
  const socket = (id: string, t: number): CaptureEvent[] => [
    { ...at(t), kind: 'ws-open', requestId: id, url: 'wss://qa.mercadito.test/socket.io/?EIO=4' },
    {
      ...at(t + 50),
      kind: 'ws-frame',
      requestId: id,
      direction: 'received',
      opcode: 1,
      payload: '44{"message":"not authorized","data":{"message":"La sesión ha expirado"}}',
      truncated: false,
    },
    { ...at(t + 60), kind: 'ws-close', requestId: id },
  ];

  it('agrupa los errores del socket y detecta las reconexiones', () => {
    const analysis = analyze([...socket('s1', 0), ...socket('s2', 1000), ...socket('s3', 2000)]);
    const [error] = byRule(analysis, 'ws-protocol-error');
    expect(error).toMatchObject({ severity: 'high', occurrences: 3 });
    expect(error?.detail).toContain('«not authorized» · «La sesión ha expirado»');
    expect(byRule(analysis, 'ws-reconnect-loop')[0]?.title).toBe('El socket /socket.io/ se abrió 3 veces');
  });

  it('agrupa excepciones y errores de consola que solo cambian en números', () => {
    const analysis = analyze([
      {
        ...at(100),
        kind: 'exception',
        message: 'TypeError: Cannot read properties of undefined (reading 12)',
        stack: 'TypeError: x\n    at render (https://qa.mercadito.test/app.js:10:5)',
      },
      { ...at(200), kind: 'exception', message: 'TypeError: Cannot read properties of undefined (reading 13)' },
      { ...at(300), kind: 'console', level: 'error', text: 'Falló el pedido 881' },
      { ...at(400), kind: 'console', level: 'error', text: 'Falló el pedido 882' },
    ]);
    expect(byRule(analysis, 'uncaught-exception')).toHaveLength(1);
    expect(byRule(analysis, 'uncaught-exception')[0]?.subject).toContain('render');
    expect(byRule(analysis, 'console-error')[0]?.occurrences).toBe(2);
  });

  it('evalúa Web Vitals contra los umbrales de Google y los bloqueos largos', () => {
    const analysis = analyze([
      { ...at(3000), kind: 'web-vital', name: 'LCP', value: 5200 },
      { ...at(3100), kind: 'web-vital', name: 'CLS', value: 0.15 },
      { ...at(3200), kind: 'web-vital', name: 'INP', value: 120 },
      { ...at(4000), kind: 'web-vital', name: 'long-task', value: 650 },
      { ...at(4100), kind: 'web-vital', name: 'long-task', value: 80 },
    ]);
    expect(byRule(analysis, 'poor-web-vital').map((finding) => finding.title)).toEqual([
      'LCP malo: 5,2 s',
      'CLS necesita mejorar: 0,15',
    ]);
    expect(byRule(analysis, 'long-task')[0]).toMatchObject({ severity: 'medium', title: 'Un bloqueo de la página de 650 ms' });
  });
});

describe('accesibilidad', () => {
  const everything = () => sampleInput({ channels: [...ALL_CAPTURE_CHANNELS] });
  const scan = (t: number, url: string, violations: A11yViolation[], durationMs = 400): CaptureEvent => ({
    ...at(t),
    kind: 'a11y-scan',
    url,
    durationMs,
    passes: 30,
    violations,
  });
  const violation = (id: string, impact: A11yViolation['impact'], targets: string[]): A11yViolation => ({
    id,
    impact,
    help: `Ayuda de ${id}`,
    description: `Garantiza que se cumpla ${id}`,
    helpUrl: `https://dequeuniversity.com/rules/axe/4.13/${id}`,
    tags: ['wcag2a'],
    nodeCount: targets.length,
    nodes: targets.map((target) => ({ target, html: '<img>', summary: 'Corrija lo siguiente: el elemento no tiene alt' })),
  });

  it('agrupa por regla de axe entre pantallas y toma el impacto más grave', () => {
    const analysis = analyze(
      [
        scan(2000, `${SITE}/checkout`, [
          violation('image-alt', 'critical', ['img.logo', 'img.banner']),
          violation('color-contrast', 'moderate', ['p.nota']),
        ]),
        scan(8000, `${SITE}/pago`, [violation('image-alt', 'serious', ['img.tarjeta'])]),
      ],
      everything(),
    );
    const findings = byRule(analysis, 'a11y-violation');
    expect(findings.map((finding) => [finding.title, finding.severity])).toEqual([
      ['Ayuda de image-alt', 'high'],
      ['Ayuda de color-contrast', 'low'],
    ]);
    expect(findings[0]).toMatchObject({ occurrences: 3, subject: 'img.logo' });
    expect(findings[0]?.evidence).toHaveLength(2);
    expect(findings[0]?.detail).toContain('3 elementos en 2 pantallas');
    expect(findings[0]?.recommendation).toBe(
      'Garantiza que se cumpla image-alt. Guía: https://dequeuniversity.com/rules/axe/4.13/image-alt',
    );
  });

  it('no cuenta como bloqueo de la página el tiempo que tarda la propia revisión', () => {
    const analysis = analyze(
      [
        scan(5000, `${SITE}/checkout`, [], 900),
        { ...at(4600), kind: 'web-vital', name: 'long-task', value: 700 },
        { ...at(9000), kind: 'web-vital', name: 'long-task', value: 300 },
      ],
      everything(),
    );
    expect(byRule(analysis, 'long-task').map((finding) => finding.title)).toEqual(['Un bloqueo de la página de 300 ms']);
  });

  it('las sesiones grabadas sin el canal lo informan en vez de callar', () => {
    const analysis = analyze([]);
    expect(analysis.skipped.find((item) => item.ruleId === 'a11y-violation')?.reason).toBe(
      'No se capturó el canal de accesibilidad.',
    );
  });
});

describe('analizador', () => {
  it('no corre las reglas de canales que no se capturaron y dice por qué', () => {
    const analysis = analyze([], sampleInput({ channels: ['network'] }));
    expect(analysis.rulesRun).toBe(12);
    expect(analysis.skipped.map((item) => item.ruleId)).toContain('uncaught-exception');
    expect(analysis.skipped.find((item) => item.ruleId === 'long-task')?.reason).toBe(
      'No se capturó el canal de rendimiento.',
    );
  });

  it('marca como fuera de alcance lo que el objetivo excluyó', () => {
    const analysis = analyze([
      ...call(0, 'GET', `${SITE}/api/recommendations`, { status: 500 }),
      ...call(0, 'GET', `${SITE}/api/cart`, { status: 500 }),
    ]);
    expect(bySubject(analysis, 'GET /api/recommendations')?.outOfScope).toBe(true);
    expect(bySubject(analysis, 'GET /api/cart')?.outOfScope).toBe(false);
  });

  it('da ids estables y ordena de lo más grave a lo menos grave', () => {
    const events = [
      { ...at(0), kind: 'console', level: 'warn', text: 'deprecado' } as CaptureEvent,
      ...call(100, 'GET', `${SITE}/api/cart`, { status: 500 }),
      ...call(200, 'GET', `${SITE}/api/profile`, { status: 404 }),
    ];
    const first = analyze(events);
    const second = analyze(events);
    expect(second.findings.map((finding) => finding.id)).toEqual(first.findings.map((finding) => finding.id));
    expect(first.findings.map((finding) => finding.severity)).toEqual(['high', 'medium', 'low']);
  });
});
