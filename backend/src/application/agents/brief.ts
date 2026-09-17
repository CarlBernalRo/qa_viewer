import {
  a11yRuleText,
  CRITERION_VERDICT_LABELS,
  decodeWsPayload,
  FINDING_SEVERITY_LABELS,
  TEST_TYPE_LABELS,
  type CaptureEvent,
  type SessionAnalysis,
  type SessionDto,
  type SessionReview,
} from '@rastro/shared';
import { SessionEvidence, type RequestTrace } from '../../domain/analysis/evidence.js';
import { safeUrl } from '../../domain/analysis/url.js';

/**
 * Referencias cortas (E1, E2…) para que los agentes citen eventos sin gastar tokens en
 * UUIDs. Lo que el modelo cite y no exista se descarta al resolver.
 */
export class EvidenceRefs {
  private readonly refByEvent = new Map<string, string>();
  private readonly eventByRef = new Map<string, string>();

  ref(eventId: string): string {
    let ref = this.refByEvent.get(eventId);
    if (!ref) {
      ref = `E${this.refByEvent.size + 1}`;
      this.refByEvent.set(eventId, ref);
      this.eventByRef.set(ref, eventId);
    }
    return ref;
  }

  list(eventIds: readonly string[], max = 4): string {
    const shown = eventIds.slice(0, max).map((id) => this.ref(id));
    return eventIds.length > max ? `${shown.join(', ')} (+${eventIds.length - max})` : shown.join(', ');
  }

  /** Para guardar el mapa en el punto de control y retomar con las mismas referencias. */
  entries(): Array<[string, string]> {
    return [...this.eventByRef];
  }

  static fromEntries(entries: ReadonlyArray<readonly [string, string]>): EvidenceRefs {
    const refs = new EvidenceRefs();
    for (const [ref, eventId] of entries) {
      refs.eventByRef.set(ref, eventId);
      refs.refByEvent.set(eventId, ref);
    }
    return refs;
  }

  /** Referencias citadas → ids de eventos, sin repetidos ni inventadas. */
  resolve(refs: readonly string[]): string[] {
    const ids = refs.flatMap((ref) => {
      const id = this.eventByRef.get(ref.trim().toUpperCase());
      return id ? [id] : [];
    });
    return [...new Set(ids)];
  }
}

function clock(ms: number): string {
  const safe = Math.max(0, ms);
  const seconds = Math.floor(safe / 1000);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(Math.floor(seconds / 60))}:${pad(seconds % 60)}.${Math.floor((safe % 1000) / 100)}`;
}

function clip(text: string, max: number): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

function seconds(ms: number): string {
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1).replace('.', ',')} s`;
}

const ACTION_VERBS: Record<string, string> = {
  click: 'Click en',
  input: 'Escribe en',
  change: 'Cambia',
  submit: 'Envía',
  keydown: 'Tecla en',
};

const MAX_JOURNEY_LINES = 150;
const MAX_ENDPOINTS = 100;

interface BriefInput {
  session: SessionDto;
  review: SessionReview;
  analysis: SessionAnalysis;
  events: readonly CaptureEvent[];
}

/** Lo que los tres agentes necesitan saber: objetivo, criterios, lo que decidió el QA, hallazgos y recorrido. */
export function sharedBrief({ session, review, analysis, events }: BriefInput, refs: EvidenceRefs): string {
  const { objective, capture } = session;
  const lines: string[] = [
    '# Sesión de QA',
    `Nombre: ${objective.sessionName}`,
    `Tipo de prueba: ${TEST_TYPE_LABELS[objective.testType]} · Ambiente: ${capture.environment}`,
    `URL inicial: ${capture.startUrl}`,
  ];
  if (session.startedAt && session.endedAt) {
    lines.push(`Duración: ${seconds(new Date(session.endedAt).getTime() - new Date(session.startedAt).getTime())}`);
  }
  if (objective.linkedIssue) lines.push(`Historia vinculada: ${objective.linkedIssue}`);

  lines.push('', '## Objetivo', objective.statement, '', '## Criterios de aceptación');
  for (const criterion of objective.criteria) {
    const result = review.criteria[criterion.id];
    const marks = review.markers.filter((marker) => marker.criterionId === criterion.id);
    lines.push(`- ${criterion.id}: ${criterion.text}`);
    lines.push(
      `  Veredicto del QA: ${result ? CRITERION_VERDICT_LABELS[result.verdict] : 'pendiente'}${result?.note ? ` — ${result.note}` : ''}`,
    );
    if (marks.length > 0) {
      lines.push(`  Marcas del QA: ${marks.map((marker) => `${clock(marker.t)}${marker.note ? ` «${marker.note}»` : ''}`).join(' · ')}`);
    }
  }
  const loose = review.markers.filter((marker) => marker.criterionId === null);
  if (loose.length > 0) {
    lines.push('', '## Notas del QA', ...loose.map((marker) => `- ${clock(marker.t)} ${marker.note}`));
  }
  if (objective.scope.include.length > 0) lines.push('', `Alcance, incluye: ${objective.scope.include.join(', ')}`);
  if (objective.scope.exclude.length > 0) lines.push(`Alcance, excluye: ${objective.scope.exclude.join(', ')}`);
  if (objective.testData) lines.push(`Datos de prueba: ${objective.testData}`);

  const active = analysis.findings.filter((finding) => finding.decision?.decision !== 'dismissed');
  const dismissed = analysis.findings.filter((finding) => finding.decision?.decision === 'dismissed');
  lines.push('', `## Hallazgos de las reglas fijas (${active.length})`);
  for (const finding of active) {
    const confirmed = finding.decision?.decision === 'confirmed' ? ' [confirmado por el QA]' : '';
    lines.push(
      `- [${FINDING_SEVERITY_LABELS[finding.severity]}]${confirmed} ${finding.title} (${finding.occurrences}×, desde ${clock(finding.firstAt)}) — ${clip(finding.detail, 300)} Evidencia: ${refs.list(finding.evidence)}`,
    );
  }
  if (dismissed.length > 0) {
    lines.push(`El QA descartó como falsos positivos: ${dismissed.map((finding) => finding.title).join('; ')}`);
  }

  lines.push('', '## Recorrido del usuario (acciones y pantallas)');
  const journey = events.filter((event) => event.kind === 'user-action' || event.kind === 'navigation');
  for (const event of journey.slice(0, MAX_JOURNEY_LINES)) {
    if (event.kind === 'navigation') {
      lines.push(`- ${clock(event.t)} ${refs.ref(event.id)} Pantalla: ${event.url}`);
    } else if (event.kind === 'user-action') {
      const target = event.label?.trim() ? event.label : event.selector;
      lines.push(`- ${clock(event.t)} ${refs.ref(event.id)} ${ACTION_VERBS[event.action] ?? event.action} «${clip(target, 80)}»`);
    }
  }
  if (journey.length > MAX_JOURNEY_LINES) lines.push(`(y ${journey.length - MAX_JOURNEY_LINES} acciones más)`);
  return lines.join('\n');
}

const API_TYPES = new Set(['XHR', 'Fetch', 'Document', 'EventSource']);

function statusText(trace: RequestTrace): string {
  if (trace.failed) return trace.failed.canceled ? 'cancelada' : `falló (${trace.failed.errorText})`;
  return trace.response ? String(trace.response.status) : 'sin respuesta';
}

const isProblem = (trace: RequestTrace) => Boolean(trace.failed && !trace.failed.canceled) || (trace.response?.status ?? 0) >= 400;

/** Evidencia del agente API REST: llamadas HTTP agrupadas por endpoint (sin WebSocket: eso es de Tiempo real). */
export function apiDigest(session: SessionDto, events: readonly CaptureEvent[], refs: EvidenceRefs): string {
  const evidence = new SessionEvidence({ objective: session.objective, capture: session.capture, events });
  const groups = new Map<string, RequestTrace[]>();
  for (const trace of evidence.requests) {
    if (!API_TYPES.has(trace.request.resourceType) && !isProblem(trace)) continue;
    const key = evidence.endpoint(trace.request.method, trace.request.url);
    const group = groups.get(key);
    if (group) group.push(trace);
    else groups.set(key, [trace]);
  }

  const lines = ['## Llamadas HTTP (API, documentos y fallos), agrupadas por endpoint'];
  if (groups.size === 0) lines.push('No hay llamadas registradas.');
  for (const [endpoint, traces] of [...groups].slice(0, MAX_ENDPOINTS)) {
    const [first] = traces;
    if (!first) continue;
    const statuses = [...new Set(traces.map(statusText))].join(', ');
    const slowest = Math.max(...traces.map((trace) => trace.finished?.durationMs ?? 0));
    lines.push(
      `- ${endpoint} · ${traces.length} ${traces.length === 1 ? 'llamada' : 'llamadas'} · status ${statuses} · hasta ${seconds(slowest)} · desde ${clock(first.request.t)} · ${refs.list(traces.map((trace) => trace.request.id), 3)}`,
    );
    const problem = traces.find(isProblem);
    const sample = problem ?? first;
    if (sample.request.postData && sample.request.method !== 'GET') {
      lines.push(`  Enviado: ${clip(sample.request.postData, 300)}`);
    }
    if (problem?.response?.body) lines.push(`  Respuesta (${problem.response.status}): ${clip(problem.response.body, 400)}`);
  }
  if (groups.size > MAX_ENDPOINTS) lines.push(`(y ${groups.size - MAX_ENDPOINTS} endpoints más)`);
  return lines.join('\n');
}

/** Evidencia del agente Tiempo real: conversaciones de WebSocket y SSE (antes era parte de API REST). */
export function realtimeDigest(session: SessionDto, events: readonly CaptureEvent[], refs: EvidenceRefs): string {
  const evidence = new SessionEvidence({ objective: session.objective, capture: session.capture, events });
  const lines = ['## WebSocket y SSE'];
  if (evidence.sockets.length === 0) lines.push('No hubo conexiones.');
  for (const socket of evidence.sockets) {
    const endpoint = socket.open ? evidence.endpoint('WS', socket.open.url) : 'WS (sin URL)';
    const closed = socket.close ? `cerrado en ${clock(socket.close.t)}` : 'abierto hasta el final';
    lines.push(
      `- ${endpoint} · abierto en ${clock(socket.open?.t ?? 0)} · ${socket.frames.length} mensajes · ${closed}${socket.open ? ` · ${refs.ref(socket.open.id)}` : ''}`,
    );
    const decoded = socket.frames.map((frame) => ({ frame, message: decodeWsPayload(frame.payload) }));
    const notable = [...decoded.filter((item) => item.message.isError), ...decoded.filter((item) => !item.message.isError)].slice(0, 8);
    for (const { frame, message } of notable.sort((a, b) => a.frame.t - b.frame.t)) {
      lines.push(
        `  ${clock(frame.t)} ${refs.ref(frame.id)} ${frame.direction === 'sent' ? '↑' : '↓'} ${message.isError ? '[error] ' : ''}${clip(message.label, 120)}${message.json !== undefined ? ` ${clip(JSON.stringify(message.json), 200)}` : ''}`,
      );
    }
  }
  return lines.join('\n');
}

/** Evidencia del agente Front-end: excepciones y consola (accesibilidad y rendimiento tienen su propio agente). */
export function frontendDigest(events: readonly CaptureEvent[], refs: EvidenceRefs): string {
  const lines = ['## Excepciones de JavaScript sin capturar'];
  const exceptions = new Map<string, Extract<CaptureEvent, { kind: 'exception' }>[]>();
  for (const event of events) {
    if (event.kind !== 'exception') continue;
    const group = exceptions.get(event.message);
    if (group) group.push(event);
    else exceptions.set(event.message, [event]);
  }
  if (exceptions.size === 0) lines.push('Ninguna.');
  for (const [message, group] of exceptions) {
    const [first] = group;
    if (!first) continue;
    const frame = first.stack?.split('\n').find((row) => /^\s*at\s/.test(row))?.trim();
    lines.push(
      `- ${clock(first.t)} ${clip(message, 200)} (${group.length}×) ${refs.list(group.map((event) => event.id), 3)}${frame ? ` — ${clip(frame, 160)}` : ''}`,
    );
  }

  lines.push('', '## Consola: errores y advertencias');
  const consoleGroups = new Map<string, Extract<CaptureEvent, { kind: 'console' }>[]>();
  for (const event of events) {
    if (event.kind !== 'console' || (event.level !== 'error' && event.level !== 'warn')) continue;
    const key = `${event.level}|${event.text.replace(/\d+/g, '#').slice(0, 200)}`;
    const group = consoleGroups.get(key);
    if (group) group.push(event);
    else consoleGroups.set(key, [event]);
  }
  if (consoleGroups.size === 0) lines.push('Ninguno.');
  for (const group of [...consoleGroups.values()].slice(0, 40)) {
    const [first] = group;
    if (!first) continue;
    lines.push(
      `- ${clock(first.t)} [${first.level === 'error' ? 'error' : 'advertencia'}] ${clip(first.text, 200)} (${group.length}×) ${refs.list(group.map((event) => event.id), 3)}`,
    );
  }
  return lines.join('\n');
}

/** Evidencia del agente Accesibilidad: violaciones de axe-core por pantalla (antes era parte de Front-end). */
export function a11yDigest(events: readonly CaptureEvent[], refs: EvidenceRefs): string {
  const lines = ['## Accesibilidad (axe-core, por pantalla)'];
  const scans = events.filter((event) => event.kind === 'a11y-scan');
  if (scans.length === 0) lines.push('No se revisó (el canal no estaba activo o no hubo pantallas).');
  for (const scan of scans) {
    const problems = scan.violations
      .map((violation) => `${a11yRuleText(violation).help} [${violation.impact ?? 'sin impacto'}] ×${violation.nodeCount}`)
      .join('; ');
    lines.push(`- ${clock(scan.t)} ${refs.ref(scan.id)} ${scan.url}: ${problems || 'sin problemas'}`);
  }
  return lines.join('\n');
}

/** Evidencia del agente Rendimiento: Web Vitals y bloqueos largos (antes era parte de Front-end). */
export function perfDigest(events: readonly CaptureEvent[], refs: EvidenceRefs): string {
  const lines = ['## Rendimiento'];
  const vitals = events.filter((event) => event.kind === 'web-vital');
  const main = vitals.filter((event) => event.name !== 'long-task');
  const longTasks = vitals.filter((event) => event.name === 'long-task' && event.value >= 200).sort((a, b) => b.value - a.value);
  if (main.length === 0 && longTasks.length === 0) lines.push('Sin métricas registradas.');
  for (const vital of main) {
    lines.push(`- ${clock(vital.t)} ${refs.ref(vital.id)} ${vital.name} ${vital.name === 'CLS' ? vital.value : seconds(vital.value)}`);
  }
  if (longTasks.length > 0) {
    lines.push(
      `- Bloqueos de 200 ms o más: ${longTasks.slice(0, 10).map((task) => `${seconds(task.value)} en ${clock(task.t)} ${refs.ref(task.id)}`).join(' · ')}`,
    );
  }
  return lines.join('\n');
}

const CONSEQUENCE_WINDOW_MS = 2500;

/**
 * Evidencia del agente Funcional: cada acción del usuario con lo que pasó justo después (requests
 * lanzadas, errores de consola/excepciones, cambio de pantalla), para ver si el flujo funcionó.
 */
export function funcDigest(events: readonly CaptureEvent[], refs: EvidenceRefs): string {
  const lines = ['## Acciones del usuario y su consecuencia inmediata (hasta 2,5 s después)'];
  const actions = events.filter((event) => event.kind === 'user-action');
  if (actions.length === 0) lines.push('No hubo acciones del usuario.');
  for (const action of actions) {
    const windowEnd = action.t + CONSEQUENCE_WINDOW_MS;
    const consequences = events.filter((event) => event.t > action.t && event.t <= windowEnd && event !== action);
    const requests = consequences.filter((event) => event.kind === 'http-request');
    const failures = consequences.filter(
      (event) =>
        event.kind === 'exception' ||
        (event.kind === 'console' && event.level === 'error') ||
        (event.kind === 'http-response' && event.status >= 400),
    );
    const navigated = consequences.find((event) => event.kind === 'navigation');
    const target = action.label?.trim() ? action.label : action.selector;
    const parts = [
      requests.length > 0 ? `${requests.length} request${requests.length === 1 ? '' : 's'}` : null,
      navigated ? `navegó a ${navigated.kind === 'navigation' ? navigated.url : ''}` : null,
      failures.length > 0 ? `${failures.length} error${failures.length === 1 ? '' : 'es'}: ${refs.list(failures.map((event) => event.id), 3)}` : null,
    ].filter((part): part is string => Boolean(part));
    lines.push(
      `- ${clock(action.t)} ${refs.ref(action.id)} ${ACTION_VERBS[action.action] ?? action.action} «${clip(target, 80)}» → ${parts.length > 0 ? parts.join(' · ') : 'sin consecuencia visible en los 2,5 s siguientes'}`,
    );
  }
  return lines.join('\n');
}

const VERSION_HEADER = /^(x-app-version|x-build|x-release|x-version|x-git-sha|x-commit)$/i;
const VERSION_TEXT = /\b(v\d+\.\d+(\.\d+)?|version[:\s]+[\w.-]+|build[:\s]+[\w.-]+)\b/i;

/** Evidencia del agente Ambiente: qué versión o build expone el sitio, en el ambiente donde se grabó. */
export function envDigest(session: SessionDto, events: readonly CaptureEvent[], refs: EvidenceRefs): string {
  const evidence = new SessionEvidence({ objective: session.objective, capture: session.capture, events });
  const lines = [
    '## Ambiente de la sesión',
    `Ambiente etiquetado: ${session.capture.environment} · URL inicial: ${session.capture.startUrl}`,
    '',
    '## Headers con versión o build (respuestas del propio sitio)',
  ];
  let anyHeader = false;
  for (const trace of evidence.requests) {
    if (!trace.response || !evidence.isFirstParty(trace.request.url)) continue;
    for (const [name, value] of Object.entries(trace.response.headers)) {
      if (!VERSION_HEADER.test(name)) continue;
      anyHeader = true;
      lines.push(`- ${name}: ${clip(value, 140)} · ${evidence.endpoint(trace.request.method, trace.request.url)} ${refs.ref(trace.request.id)}`);
    }
  }
  if (!anyHeader) lines.push('Ninguno de los headers de versión habituales.');

  lines.push('', '## Menciones de versión o build en consola');
  let anyLog = false;
  for (const event of events) {
    if (event.kind !== 'console') continue;
    if (!VERSION_TEXT.test(event.text)) continue;
    anyLog = true;
    lines.push(`- ${clock(event.t)} ${refs.ref(event.id)} ${clip(event.text, 200)}`);
  }
  if (!anyLog) lines.push('Ninguna.');
  return lines.join('\n');
}

function headerMap(headers: Record<string, string> | undefined): Map<string, string> {
  return new Map(Object.entries(headers ?? {}).map(([name, value]) => [name.toLowerCase(), value]));
}

interface ParsedCookie {
  name: string;
  attributes: readonly string[];
}

/** CDP une varios Set-Cookie con saltos de línea; de cada uno interesan el nombre y los atributos. */
function parseSetCookie(value: string): ParsedCookie[] {
  return value.split('\n').flatMap((line) => {
    const [pair = '', ...attributes] = line.split(';');
    const name = pair.split('=')[0]?.trim() ?? '';
    if (!name || !pair.includes('=')) return [];
    return [{ name, attributes: attributes.map((attr) => attr.trim()).filter(Boolean) }];
  });
}

const CREDENTIAL_PARAM =
  /^(token|access_?token|id_?token|refresh_?token|auth|auth_?token|authorization|jwt|api_?key|apikey|session|session_?id|sid|password|passwd|pwd|secret|client_?secret)$/i;

const SECURITY_HEADERS = [
  'content-security-policy',
  'strict-transport-security',
  'x-content-type-options',
  'x-frame-options',
  'access-control-allow-origin',
  'server',
  'x-powered-by',
] as const;

/**
 * Evidencia del agente Seguridad: headers de respuesta, cookies y URLs con pinta de credencial,
 * en bruto (no las conclusiones de las reglas fijas, que ya están en el resumen compartido). Solo
 * mira lo que es del propio sitio: analytics y CDNs de terceros no son su objetivo.
 */
export function securityDigest(session: SessionDto, events: readonly CaptureEvent[], refs: EvidenceRefs): string {
  const evidence = new SessionEvidence({ objective: session.objective, capture: session.capture, events });

  const lines = ['## Headers de respuesta (primera parte del sitio, por origen)'];
  const byOrigin = new Map<string, RequestTrace>();
  for (const trace of evidence.requests) {
    if (!trace.response || !evidence.isFirstParty(trace.request.url)) continue;
    if (trace.request.resourceType !== 'Document') continue;
    const origin = safeUrl(trace.request.url)?.origin ?? trace.request.url;
    if (!byOrigin.has(origin)) byOrigin.set(origin, trace);
  }
  if (byOrigin.size === 0) lines.push('No hay documentos propios registrados.');
  for (const [origin, trace] of byOrigin) {
    const headers = headerMap(trace.response?.headers);
    const present = SECURITY_HEADERS.filter((name) => headers.has(name)).map((name) => `${name}: ${clip(headers.get(name) ?? '', 140)}`);
    lines.push(`- ${origin} ${refs.ref(trace.request.id)}: ${present.length > 0 ? present.join(' · ') : 'ninguno de los headers de seguridad habituales'}`);
  }

  lines.push('', '## Cookies del sitio (Set-Cookie), con sus atributos');
  let anyCookie = false;
  for (const trace of evidence.requests) {
    const setCookie = headerMap(trace.response?.headers).get('set-cookie');
    if (!setCookie || !evidence.isFirstParty(trace.request.url)) continue;
    for (const cookie of parseSetCookie(setCookie)) {
      anyCookie = true;
      lines.push(
        `- ${cookie.name} [${cookie.attributes.join(', ') || 'sin atributos'}] · ${trace.request.url.startsWith('https:') ? 'https' : 'http'} · ${refs.ref(trace.request.id)}`,
      );
    }
  }
  if (!anyCookie) lines.push('No se registraron cookies propias.');

  lines.push('', '## URLs con parámetros que parecen credenciales');
  let anyCredential = false;
  for (const trace of evidence.requests) {
    if (!evidence.isFirstParty(trace.request.url)) continue;
    const url = safeUrl(trace.request.url);
    if (!url) continue;
    const hit = [...url.searchParams.keys()].find((param) => CREDENTIAL_PARAM.test(param));
    if (!hit) continue;
    anyCredential = true;
    lines.push(`- «${hit}» en ${evidence.endpoint(trace.request.method, trace.request.url)} ${refs.ref(trace.request.id)}`);
  }
  if (!anyCredential) lines.push('Ninguna.');

  lines.push('', '## Contenido servido por http:// en una página https://');
  const insecure = evidence.pageIsHttps
    ? evidence.requests.filter((trace) => safeUrl(trace.request.url)?.protocol === 'http:')
    : [];
  if (insecure.length === 0) lines.push(evidence.pageIsHttps ? 'Ninguno.' : 'La página no es https://.');
  else {
    lines.push(
      `- ${insecure.length} ${insecure.length === 1 ? 'recurso' : 'recursos'}: ${refs.list(insecure.map((trace) => trace.request.id), 5)}`,
    );
  }

  return lines.join('\n');
}
