import type { CaptureEvent, SessionDto } from '@rastro/shared';
import { SessionEvidence, type RequestTrace } from '../../domain/analysis/evidence.js';

const API_TYPES = new Set(['XHR', 'Fetch']);

function jsString(value: string): string {
  return JSON.stringify(value);
}

/** Uno por endpoint: usa la primera llamada real como muestra de método, URL y cuerpo. */
function requestLine(trace: RequestTrace, index: number): string {
  const { method, url, postData } = trace.request;
  const varName = `res${index}`;
  if (method === 'GET' || method === 'HEAD') {
    return `  const ${varName} = http.${method === 'GET' ? 'get' : 'head'}(${jsString(url)}, { headers });`;
  }
  const body = postData ? jsString(postData) : 'null';
  const verb = method.toLowerCase();
  const fn = ['post', 'put', 'patch', 'delete'].includes(verb) ? verb : 'request';
  return fn === 'request'
    ? `  const ${varName} = http.request(${jsString(method)}, ${jsString(url)}, ${body}, { headers });`
    : `  const ${varName} = http.${fn}(${jsString(url)}, ${body}, { headers });`;
}

/**
 * Script k6 parametrizado desde el tráfico real de la sesión: un request de muestra por endpoint,
 * en el orden en que se lanzaron, con un check de status y una pausa entre pasos. Es determinístico
 * (no usa IA): "generar el script" es la tarea del agente Carga de la visión de producto, no "analizar".
 * El QA debe revisar los valores de ejemplo (datos de prueba, no reales) antes de correrlo.
 */
export function generateK6Script(session: SessionDto, events: readonly CaptureEvent[]): string {
  const evidence = new SessionEvidence({ objective: session.objective, capture: session.capture, events });
  const seen = new Set<string>();
  const steps: RequestTrace[] = [];
  for (const trace of evidence.requests) {
    if (!API_TYPES.has(trace.request.resourceType) || !evidence.isFirstParty(trace.request.url)) continue;
    const key = `${trace.request.method} ${trace.request.url.split('?')[0]}`;
    if (seen.has(key)) continue;
    seen.add(key);
    steps.push(trace);
  }
  steps.sort((a, b) => a.request.t - b.request.t);

  const lines = [
    '// Generado por Rastro a partir del tráfico real de una sesión grabada.',
    `// Sesión: ${session.objective.sessionName} (${session.id})`,
    '// Revisá los valores de ejemplo (datos de prueba, no reales) antes de correrlo.',
    "import http from 'k6/http';",
    "import { check, sleep } from 'k6';",
    '',
    'export const options = {',
    '  vus: 5,',
    "  duration: '30s',",
    '};',
    '',
    'const headers = { \'Content-Type\': \'application/json\' };',
    '',
    'export default function () {',
  ];

  if (steps.length === 0) {
    lines.push('  // No se registraron llamadas a la API del propio sitio en esta sesión.');
  }
  steps.forEach((trace, index) => {
    lines.push(`  // ${trace.request.method} ${trace.request.url}`, requestLine(trace, index));
    lines.push(`  check(res${index}, { 'status es 2xx o 3xx': (r) => r.status >= 200 && r.status < 400 });`, '  sleep(1);', '');
  });
  lines.push('}');
  return lines.join('\n');
}
