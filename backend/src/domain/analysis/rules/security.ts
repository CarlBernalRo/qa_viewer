import type { CaptureEvent, FindingSeverity } from '@rastro/shared';
import { REDACTED } from '../../redaction/Redactor.js';
import type { RequestTrace } from '../evidence.js';
import { distinct, groupBy, times, type FindingDraft, type Rule } from '../rule.js';
import { isLocalHost, safeUrl } from '../url.js';

function headerMap(headers: Record<string, string> | undefined): Map<string, string> {
  return new Map(Object.entries(headers ?? {}).map(([name, value]) => [name.toLowerCase(), value]));
}

const originOf = (raw: string) => safeUrl(raw)?.origin ?? raw;
const hostOf = (raw: string) => safeUrl(raw)?.host ?? raw;

function evidenceOf(traces: RequestTrace[]): Pick<FindingDraft, 'evidence' | 'urls'> {
  return { evidence: traces.map((trace) => trace.request), urls: traces.map((trace) => trace.request.url) };
}

export const missingSecurityHeaders: Rule = {
  id: 'missing-security-headers',
  run(evidence) {
    const pages = evidence.requests.filter((trace) => {
      const status = trace.response?.status ?? 0;
      return (
        trace.request.resourceType === 'Document' &&
        status >= 200 &&
        status < 300 &&
        /html/i.test(trace.response?.mimeType ?? '') &&
        evidence.isFirstParty(trace.request.url)
      );
    });
    return [...groupBy(pages, (trace) => originOf(trace.request.url))].flatMap(([origin, traces]): FindingDraft[] => {
      const [first] = traces;
      if (!first) return [];
      const headers = headerMap(first.response?.headers);
      const csp = headers.get('content-security-policy') ?? '';
      const missing: string[] = [];
      if (!csp) missing.push('Content-Security-Policy');
      if (origin.startsWith('https:') && !headers.has('strict-transport-security')) {
        missing.push('Strict-Transport-Security');
      }
      if ((headers.get('x-content-type-options') ?? '').toLowerCase() !== 'nosniff') {
        missing.push('X-Content-Type-Options: nosniff');
      }
      if (!headers.has('x-frame-options') && !/frame-ancestors/i.test(csp)) {
        missing.push('X-Frame-Options o frame-ancestors');
      }
      if (missing.length === 0) return [];
      const dev = evidence.environment === 'DEV';
      return [
        {
          severity: dev ? 'low' : 'medium',
          key: origin,
          title: `Faltan headers de seguridad en ${hostOf(origin)}`,
          subject: origin,
          detail: `La página no envía: ${missing.join(', ')}.${dev ? ' Es el ambiente de desarrollo: confírmalo en QA o producción.' : ''}`,
          recommendation:
            'CSP limita qué scripts pueden correr (mitiga XSS). HSTS obliga a usar HTTPS. nosniff evita que el navegador adivine el tipo de archivo. X-Frame-Options o frame-ancestors impiden que otra web incruste la tuya (clickjacking).',
          ...evidenceOf(traces),
        },
      ];
    });
  },
};

const SESSION_COOKIE = /sess|sid|token|auth|jwt|login/i;

interface ParsedCookie {
  name: string;
  attributes: ReadonlySet<string>;
}

/** CDP une varios Set-Cookie con saltos de línea; de cada uno interesan el nombre y los atributos. */
function parseSetCookie(value: string): ParsedCookie[] {
  return value.split('\n').flatMap((line) => {
    const [pair = '', ...attributes] = line.split(';');
    const name = pair.split('=')[0]?.trim() ?? '';
    if (!name || !pair.includes('=')) return [];
    return [{ name, attributes: new Set(attributes.map((attr) => (attr.split('=')[0] ?? '').trim().toLowerCase())) }];
  });
}

interface CookieIssue {
  name: string;
  missing: string[];
  trace: RequestTrace;
}

const COOKIE_ADVICE: Record<string, string> = {
  Secure: 'Secure: que solo viaje por HTTPS.',
  HttpOnly: 'HttpOnly: que JavaScript no pueda leerla (mitiga el robo de sesión por XSS).',
  SameSite: 'SameSite=Lax o Strict: que no se envíe desde otros sitios (mitiga CSRF).',
};

export const insecureCookie: Rule = {
  id: 'insecure-cookie',
  run(evidence) {
    const issues: CookieIssue[] = [];
    for (const trace of evidence.requests) {
      const setCookie = headerMap(trace.response?.headers).get('set-cookie');
      if (!setCookie || !evidence.isFirstParty(trace.request.url)) continue;
      const https = trace.request.url.startsWith('https:');
      for (const cookie of parseSetCookie(setCookie)) {
        const missing: string[] = [];
        if (https && !cookie.attributes.has('secure')) missing.push('Secure');
        if (SESSION_COOKIE.test(cookie.name) && !cookie.attributes.has('httponly')) missing.push('HttpOnly');
        if (!cookie.attributes.has('samesite')) missing.push('SameSite');
        if (missing.length > 0) issues.push({ name: cookie.name, missing, trace });
      }
    }
    return [...groupBy(issues, (issue) => issue.name)].flatMap(([name, group]): FindingDraft[] => {
      const [first] = group;
      if (!first) return [];
      const missing = distinct(group.flatMap((issue) => issue.missing));
      const traces = distinct(group.map((issue) => issue.trace));
      return [
        {
          severity: missing.includes('Secure') || missing.includes('HttpOnly') ? 'medium' : 'low',
          key: name,
          title: `Cookie ${name} sin ${missing.join(' ni ')}`,
          subject: name,
          detail: `Se recibió ${times(traces.length)}; la primera, en ${evidence.endpoint(first.trace.request.method, first.trace.request.url)}.`,
          recommendation: missing.map((attribute) => COOKIE_ADVICE[attribute] ?? attribute).join(' '),
          ...evidenceOf(traces),
        },
      ];
    });
  },
};

const CREDENTIAL_PARAM =
  /^(token|access_?token|id_?token|refresh_?token|auth|auth_?token|authorization|jwt|api_?key|apikey|session|session_?id|sid|password|passwd|pwd|secret|client_?secret)$/i;

interface UrlCredential {
  param: string;
  endpoint: string;
  event: CaptureEvent;
  url: string;
  socket: boolean;
}

export const tokenInUrl: Rule = {
  id: 'token-in-url',
  run(evidence) {
    const hits: UrlCredential[] = [];
    const inspect = (event: CaptureEvent, rawUrl: string, method: string, socket: boolean) => {
      const url = safeUrl(rawUrl);
      if (!url || !evidence.isFirstParty(rawUrl)) return;
      for (const param of distinct(url.searchParams.keys())) {
        if (CREDENTIAL_PARAM.test(param)) {
          hits.push({ param, endpoint: evidence.endpoint(method, rawUrl), event, url: rawUrl, socket });
        }
      }
    };
    for (const trace of evidence.requests) inspect(trace.request, trace.request.url, trace.request.method, false);
    for (const socket of evidence.sockets) {
      if (socket.open) inspect(socket.open, socket.open.url, 'WS', true);
    }

    return [...groupBy(hits, (hit) => `${hit.endpoint}|${hit.param}`)].flatMap(([key, group]): FindingDraft[] => {
      const [first] = group;
      if (!first) return [];
      const insecure = /^(http|ws):/.test(first.url);
      const hidden = safeUrl(first.url)?.searchParams.get(first.param) === REDACTED;
      const severity: FindingSeverity = insecure ? 'high' : first.socket ? 'low' : 'medium';
      return [
        {
          severity,
          key,
          title: `Credencial en la URL: «${first.param}» en ${first.endpoint}`,
          subject: first.endpoint,
          detail: `El parámetro «${first.param}» viajó en la URL ${times(group.length)}${insecure ? ' y sin cifrar' : ''}.${hidden ? ' En la grabación, su valor quedó oculto.' : ''}`,
          recommendation: first.socket
            ? 'En WebSocket es habitual porque el navegador no permite headers propios, pero conviene un token de corta duración o enviarlo en el primer mensaje.'
            : 'Envíalo en el header Authorization o en una cookie HttpOnly. En la URL queda en logs de servidores y proxies, en el historial y en el header Referer.',
          evidence: group.map((hit) => hit.event),
          urls: group.map((hit) => hit.url),
        },
      ];
    });
  },
};

const PASSIVE_TYPES = new Set(['Image', 'Media']);

export const mixedContent: Rule = {
  id: 'mixed-content',
  run(evidence) {
    if (!evidence.pageIsHttps) return [];
    const insecure = evidence.requests.filter((trace) => {
      const url = safeUrl(trace.request.url);
      return url?.protocol === 'http:' && !isLocalHost(url.hostname);
    });
    return [...groupBy(insecure, (trace) => hostOf(trace.request.url))].flatMap(([host, traces]): FindingDraft[] => {
      if (traces.length === 0) return [];
      const passive = traces.every((trace) => PASSIVE_TYPES.has(trace.request.resourceType));
      return [
        {
          severity: passive ? 'medium' : 'high',
          key: host,
          title: `Contenido mixto desde ${host}`,
          subject: host,
          detail: `La página es https:// pero pidió ${traces.length === 1 ? 'un recurso' : `${traces.length} recursos`} por http://.`,
          recommendation:
            'Pide el recurso por https://. El navegador bloquea scripts y llamadas inseguras y marca la página como no segura.',
          ...evidenceOf(traces),
        },
      ];
    });
  },
};

const DISCLOSURE_HEADERS: ReadonlyArray<[string, string]> = [
  ['x-powered-by', 'X-Powered-By'],
  ['x-aspnet-version', 'X-AspNet-Version'],
  ['x-aspnetmvc-version', 'X-AspNetMvc-Version'],
];

export const serverDisclosure: Rule = {
  id: 'server-disclosure',
  run(evidence) {
    const leaks = new Map<string, { traces: RequestTrace[]; values: Set<string> }>();
    for (const trace of evidence.requests) {
      if (!trace.response || !evidence.isFirstParty(trace.request.url)) continue;
      const headers = headerMap(trace.response.headers);
      const found: string[] = [];
      const server = headers.get('server');
      if (server && /\d/.test(server)) found.push(`Server: ${server}`);
      for (const [name, label] of DISCLOSURE_HEADERS) {
        const value = headers.get(name);
        if (value) found.push(`${label}: ${value}`);
      }
      if (found.length === 0) continue;
      const origin = originOf(trace.request.url);
      const entry = leaks.get(origin) ?? { traces: [], values: new Set<string>() };
      entry.traces.push(trace);
      for (const value of found) entry.values.add(value);
      leaks.set(origin, entry);
    }
    return [...leaks].map(
      ([origin, { traces, values }]): FindingDraft => ({
        severity: 'low',
        key: origin,
        title: `${hostOf(origin)} expone su tecnología`,
        subject: origin,
        detail: `Headers: ${[...values].slice(0, 4).join(' · ')}.`,
        recommendation:
          'Quita la versión del header Server y elimina X-Powered-By: así es más difícil saber qué vulnerabilidades probar.',
        ...evidenceOf(traces),
      }),
    );
  },
};

export const SECURITY_RULES: readonly Rule[] = [
  missingSecurityHeaders,
  insecureCookie,
  tokenInUrl,
  mixedContent,
  serverDisclosure,
];
