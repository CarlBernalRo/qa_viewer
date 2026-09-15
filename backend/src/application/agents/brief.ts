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

/** Evidencia del agente API REST: llamadas agrupadas por endpoint y conversaciones de WebSocket. */
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

  lines.push('', '## WebSocket');
  if (evidence.sockets.length === 0) lines.push('No hubo conexiones WebSocket.');
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

/** Evidencia del agente Front-end: excepciones, consola, accesibilidad y rendimiento. */
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

  lines.push('', '## Accesibilidad (axe-core, por pantalla)');
  const scans = events.filter((event) => event.kind === 'a11y-scan');
  if (scans.length === 0) lines.push('No se revisó (el canal no estaba activo o no hubo pantallas).');
  for (const scan of scans) {
    const problems = scan.violations
      .map((violation) => `${a11yRuleText(violation).help} [${violation.impact ?? 'sin impacto'}] ×${violation.nodeCount}`)
      .join('; ');
    lines.push(`- ${clock(scan.t)} ${refs.ref(scan.id)} ${scan.url}: ${problems || 'sin problemas'}`);
  }

  lines.push('', '## Rendimiento');
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
