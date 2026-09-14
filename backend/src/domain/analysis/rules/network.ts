import type { FindingSeverity } from '@rastro/shared';
import type { RequestTrace, SessionEvidence } from '../evidence.js';
import {
  describeMessages,
  distinct,
  downgrade,
  formatBytes,
  formatMs,
  groupBy,
  parseJson,
  times,
  type FindingDraft,
  type Rule,
} from '../rule.js';

const API_TYPES = new Set(['XHR', 'Fetch']);
const STATIC_TYPES = new Set(['Script', 'Stylesheet', 'Image', 'Font', 'Media', 'Manifest']);
const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

const isApi = (trace: RequestTrace) => API_TYPES.has(trace.request.resourceType);
const statusOf = (trace: RequestTrace) => trace.response?.status ?? 0;

/** Long-polling y streams tardan a propósito: eso no es lentitud. */
const isStreaming = (trace: RequestTrace) =>
  /[?&]transport=polling/.test(trace.request.url) ||
  trace.request.resourceType === 'EventSource' ||
  /event-stream/.test(trace.response?.mimeType ?? '');

function byEndpoint(evidence: SessionEvidence, traces: RequestTrace[]): Map<string, RequestTrace[]> {
  return groupBy(traces, (trace) => evidence.endpoint(trace.request.method, trace.request.url));
}

function evidenceOf(traces: RequestTrace[]): Pick<FindingDraft, 'evidence' | 'urls'> {
  return { evidence: traces.map((trace) => trace.request), urls: traces.map((trace) => trace.request.url) };
}

/** Los terceros (analytics, CDNs) bajan un nivel: rara vez son el foco de la prueba. */
function forParty(evidence: SessionEvidence, trace: RequestTrace, severity: FindingSeverity): FindingSeverity {
  return evidence.isFirstParty(trace.request.url) ? severity : downgrade(severity);
}

export const httpServerError: Rule = {
  id: 'http-server-error',
  run(evidence) {
    const failing = evidence.requests.filter((trace) => statusOf(trace) >= 500);
    return [...byEndpoint(evidence, failing)].flatMap(([endpoint, traces]): FindingDraft[] => {
      const [first] = traces;
      if (!first) return [];
      const statuses = distinct(traces.map(statusOf)).join(', ');
      const userOperation =
        traces.some((trace) => MUTATING.has(trace.request.method)) &&
        evidence.actionBefore(first.request.t) !== undefined;
      return [
        {
          severity: forParty(evidence, first, userOperation ? 'critical' : 'high'),
          key: endpoint,
          title: `El servidor falló (${statuses}) en ${endpoint}`,
          subject: endpoint,
          detail: `Respondió ${statuses} ${times(traces.length)}.${describeMessages(parseJson(first.response?.body))}`,
          recommendation: userOperation
            ? 'Falló una operación que disparó el usuario: confirma qué mostró la pantalla y revisa el log del servidor en ese instante.'
            : 'Revisa el log del servidor en ese instante. El cuerpo de la respuesta y los headers están en el inspector.',
          ...evidenceOf(traces),
        },
      ];
    });
  },
};

export const httpClientError: Rule = {
  id: 'http-client-error',
  run(evidence) {
    const rejected = evidence.requests.filter((trace) => statusOf(trace) >= 400 && statusOf(trace) < 500);
    return [...byEndpoint(evidence, rejected)].flatMap(([endpoint, traces]): FindingDraft[] => {
      const [first] = traces;
      if (!first) return [];
      const statuses = distinct(traces.map(statusOf));
      const list = statuses.join(', ');
      const type = first.request.resourceType;
      const minor = STATIC_TYPES.has(type) || /\/favicon[^/]*$/.test(endpoint);
      const base: FindingSeverity = type === 'Document' ? 'high' : minor ? 'low' : 'medium';
      const auth = statuses.every((status) => status === 401 || status === 403);
      const missing = statuses.every((status) => status === 404);
      return [
        {
          severity: forParty(evidence, first, base),
          key: endpoint,
          title: auth
            ? `Sin autorización (${list}) en ${endpoint}`
            : missing
              ? `No encontrado (404): ${endpoint}`
              : `Petición rechazada (${list}) en ${endpoint}`,
          subject: endpoint,
          detail: `Respondió ${list} ${times(traces.length)}.${describeMessages(parseJson(first.response?.body))}`,
          recommendation: auth
            ? 'Confirma si el usuario de prueba debía tener acceso. Si lo tenía, es un bug de permisos o de una sesión que venció.'
            : missing
              ? 'Puede ser un enlace roto o un endpoint que cambió de nombre.'
              : 'El cuerpo de la respuesta suele explicar qué dato se rechazó.',
          ...evidenceOf(traces),
        },
      ];
    });
  },
};

export const httpNetworkFailure: Rule = {
  id: 'http-network-failure',
  run(evidence) {
    const failed = evidence.requests.filter((trace) => trace.failed && !trace.failed.canceled);
    const groups = groupBy(
      failed,
      (trace) => `${evidence.endpoint(trace.request.method, trace.request.url)}|${trace.failed?.errorText ?? ''}`,
    );
    return [...groups].flatMap(([key, traces]): FindingDraft[] => {
      const [first] = traces;
      const errorText = first?.failed?.errorText;
      if (!first || !errorText) return [];
      const endpoint = evidence.endpoint(first.request.method, first.request.url);
      const blocked = /ERR_BLOCKED_BY_CLIENT/.test(errorText);
      return [
        {
          severity: blocked || /ERR_ABORTED/.test(errorText) ? 'low' : forParty(evidence, first, 'high'),
          key,
          title: `No llegó: ${endpoint}`,
          subject: endpoint,
          detail: `Falló con ${errorText} ${times(traces.length)}.${blocked ? ' La bloqueó una extensión del navegador.' : ''}`,
          recommendation:
            'Mira la consola en ese momento: los errores de CORS, de certificado y de DNS aparecen ahí con más detalle.',
          ...evidenceOf(traces),
        },
      ];
    });
  },
};

const SLOW_MS = 3000;
const VERY_SLOW_MS = 8000;

export const slowRequest: Rule = {
  id: 'slow-request',
  run(evidence) {
    const candidates = evidence.requests.filter(
      (trace) => (isApi(trace) || trace.request.resourceType === 'Document') && !isStreaming(trace) && trace.finished,
    );
    return [...byEndpoint(evidence, candidates)].flatMap(([endpoint, all]): FindingDraft[] => {
      const slow = all.filter((trace) => (trace.finished?.durationMs ?? 0) >= SLOW_MS);
      const [first] = slow;
      if (!first) return [];
      const worst = Math.max(...slow.map((trace) => trace.finished?.durationMs ?? 0));
      return [
        {
          severity: forParty(evidence, first, worst >= VERY_SLOW_MS ? 'high' : 'medium'),
          key: endpoint,
          title: `Petición lenta: ${endpoint}`,
          subject: endpoint,
          detail: `Tardó hasta ${formatMs(worst)} (${slow.length} de ${all.length} por encima de 3 s).`,
          recommendation:
            'Compara con el tiempo esperado para esta operación. Si la pantalla no mostró un indicador de carga, también es un problema de experiencia.',
          ...evidenceOf(slow),
        },
      ];
    });
  },
};

/** El grupo más grande de llamadas que caben en una ventana de `windowMs`. */
function largestBurst(traces: RequestTrace[], windowMs: number): RequestTrace[] {
  let best: RequestTrace[] = [];
  let start = 0;
  for (let end = 0; end < traces.length; end += 1) {
    const endT = traces[end]?.request.t ?? 0;
    while ((traces[start]?.request.t ?? 0) < endT - windowMs) start += 1;
    if (end - start + 1 > best.length) best = traces.slice(start, end + 1);
  }
  return best;
}

export const duplicateRequest: Rule = {
  id: 'duplicate-request',
  run(evidence) {
    const api = evidence.requests.filter((trace) => isApi(trace) && !isStreaming(trace));
    const groups = groupBy(
      api,
      (trace) => `${trace.request.method} ${trace.request.url} ${trace.request.postData ?? ''}`,
    );
    return [...groups].flatMap(([key, traces]): FindingDraft[] => {
      const mutating = MUTATING.has(traces[0]?.request.method ?? 'GET');
      // Un envío repetido en 1 s ya es sospechoso (doble click); una consulta, desde 3 en 2 s.
      const burst = mutating ? largestBurst(traces, 1000) : largestBurst(traces, 2000);
      const [first] = burst;
      const last = burst[burst.length - 1];
      if (!first || !last || burst.length < (mutating ? 2 : 3)) return [];
      const endpoint = evidence.endpoint(first.request.method, first.request.url);
      const firstParty = evidence.isFirstParty(first.request.url);
      return [
        {
          severity: firstParty && mutating ? 'high' : 'low',
          key,
          title: mutating ? `Envío duplicado: ${endpoint}` : `Petición repetida: ${endpoint}`,
          subject: endpoint,
          detail: `Se hizo ${burst.length} veces en ${formatMs(last.request.t - first.request.t)} con los mismos datos.`,
          recommendation: mutating
            ? 'Comprueba si se crearon registros duplicados y si el botón se bloquea mientras espera la respuesta.'
            : 'Suele ser un efecto que se dispara varias veces o falta de caché. No rompe nada, pero suma carga al servidor.',
          ...evidenceOf(burst),
        },
      ];
    });
  },
};

/** El JSON de una respuesta 2xx informa un error. */
function reportsError(body: unknown): boolean {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return false;
  const record = body as Record<string, unknown>;
  if (record['success'] === false || record['ok'] === false) return true;
  const status = record['status'];
  if (typeof status === 'string' && /^(error|fail|failed|failure)$/i.test(status)) return true;
  const errors = record['errors'];
  if (Array.isArray(errors) && errors.length > 0) return true;
  const error = record['error'];
  if (typeof error === 'string') return error.trim() !== '';
  if (error === true) return true;
  return Boolean(error) && typeof error === 'object' && Object.keys(error as object).length > 0;
}

export const errorInSuccess: Rule = {
  id: 'error-in-success',
  run(evidence) {
    const flagged = evidence.requests.filter(
      (trace) =>
        isApi(trace) &&
        statusOf(trace) >= 200 &&
        statusOf(trace) < 300 &&
        !trace.response?.bodyTruncated &&
        reportsError(parseJson(trace.response?.body)),
    );
    return [...byEndpoint(evidence, flagged)].flatMap(([endpoint, traces]): FindingDraft[] => {
      const [first] = traces;
      if (!first?.response) return [];
      return [
        {
          severity: forParty(evidence, first, 'high'),
          key: endpoint,
          title: `Falso éxito: ${endpoint} respondió ${first.response.status} con un error`,
          subject: endpoint,
          detail: `El status dice éxito, pero el JSON informa un error (${times(traces.length)}).${describeMessages(parseJson(first.response.body))}`,
          recommendation:
            'Verifica qué mostró la pantalla. Si mostró éxito, es un bug; si mostró el error, conviene que la API responda con un status 4xx o 5xx.',
          ...evidenceOf(traces),
        },
      ];
    });
  },
};

const LARGE_BYTES = 1024 * 1024;
const HUGE_BYTES = 5 * 1024 * 1024;

export const largeResponse: Rule = {
  id: 'large-response',
  run(evidence) {
    const heavy = evidence.requests.filter(
      (trace) => isApi(trace) && (trace.finished?.encodedDataLength ?? 0) >= LARGE_BYTES,
    );
    return [...byEndpoint(evidence, heavy)].flatMap(([endpoint, traces]): FindingDraft[] => {
      const [first] = traces;
      if (!first) return [];
      const biggest = Math.max(...traces.map((trace) => trace.finished?.encodedDataLength ?? 0));
      return [
        {
          severity: forParty(evidence, first, biggest >= HUGE_BYTES ? 'medium' : 'low'),
          key: endpoint,
          title: `Respuesta pesada: ${endpoint}`,
          subject: endpoint,
          detail: `Pesó hasta ${formatBytes(biggest)} (${times(traces.length)} por encima de 1 MB).`,
          recommendation: 'Considera paginar, pedir solo los campos necesarios o comprimir la respuesta (gzip o brotli).',
          ...evidenceOf(traces),
        },
      ];
    });
  },
};

export const NETWORK_RULES: readonly Rule[] = [
  httpServerError,
  httpClientError,
  httpNetworkFailure,
  slowRequest,
  duplicateRequest,
  errorInSuccess,
  largeResponse,
];
