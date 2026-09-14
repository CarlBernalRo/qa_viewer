import {
  CRITERION_VERDICT_LABELS,
  FINDING_CATEGORY_LABELS,
  FINDING_SEVERITIES,
  FINDING_SEVERITY_LABELS,
  RULE_CATALOG,
  summarizeCriteria,
  TEST_TYPE_LABELS,
  type CriterionVerdict,
  type Finding,
  type FindingCategory,
  type FindingSeverity,
  type Marker,
  type SessionStatus,
} from '@rastro/shared';
import type { SessionReportData } from '../../domain/ports.js';

const STATUS_LABELS: Record<SessionStatus, string> = {
  draft: 'Lista para grabar',
  recording: 'Grabando',
  completed: 'Grabada',
  failed: 'Falló',
};

const SEVERITY_COLORS: Record<FindingSeverity, string> = {
  critical: '#b42318',
  high: '#c1502a',
  medium: '#b26a00',
  low: '#8a938d',
};

const VERDICT_COLORS: Record<CriterionVerdict | 'pending', string> = {
  pass: '#2e7d4f',
  fail: '#b42318',
  blocked: '#b26a00',
  pending: '#8a938d',
};

const CATEGORY_ORDER: readonly FindingCategory[] = [
  'network',
  'security',
  'accessibility',
  'frontend',
  'realtime',
  'performance',
  'functional',
];

const ENTITIES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Todo texto del informe pasa por aquí: muchos vienen de la página grabada, que no es de confianza. */
export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => ENTITIES[char] ?? char);
}

/** Texto escapado con sus URLs convertidas en enlaces (las guías de cada regla). */
function withLinks(text: string): string {
  return escapeHtml(text).replace(/https?:\/\/[^\s<]+/g, (url) => `<a href="${url}">${url}</a>`);
}

const isText = (value: string | null | false | undefined): value is string => Boolean(value);

function clock(ms: number): string {
  const safe = Math.max(0, ms);
  const seconds = Math.floor(safe / 1000);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(Math.floor(seconds / 60))}:${pad(seconds % 60)}.${Math.floor((safe % 1000) / 100)}`;
}

function duration(ms: number): string {
  const total = Math.round(ms / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  if (minutes === 0) return `${seconds} s`;
  return seconds === 0 ? `${minutes} min` : `${minutes} min ${seconds} s`;
}

const dateFormat = new Intl.DateTimeFormat('es', { dateStyle: 'long', timeStyle: 'short' });

/** "00:12.4 — Aparece el error · 00:30.0" */
function markerList(markers: readonly Marker[]): string {
  return markers.map((marker) => `${clock(marker.t)}${marker.note ? ` — ${escapeHtml(marker.note)}` : ''}`).join(' · ');
}

function findingBlock(finding: Finding): string {
  const meta = [
    `Primera vez: ${clock(finding.firstAt)}`,
    finding.occurrences > 1 && `${finding.occurrences} ocurrencias`,
    finding.afterAction && `después de: ${finding.afterAction.label}`,
    finding.outOfScope && 'fuera del alcance del objetivo',
  ].filter(isText);
  const confirmed = finding.decision?.decision === 'confirmed';
  return `
    <article class="finding" style="border-left-color:${SEVERITY_COLORS[finding.severity]}">
      <div class="finding-head">
        <span class="sev" style="background:${SEVERITY_COLORS[finding.severity]}">${FINDING_SEVERITY_LABELS[finding.severity]}</span>
        <h4>${escapeHtml(finding.title)}</h4>
        ${confirmed ? '<span class="tag">Confirmado</span>' : ''}
      </div>
      ${finding.subject ? `<p class="subject">${escapeHtml(finding.subject)}</p>` : ''}
      <p>${withLinks(finding.detail)}</p>
      ${finding.recommendation ? `<p class="rec"><strong>Recomendación:</strong> ${withLinks(finding.recommendation)}</p>` : ''}
      ${finding.decision?.note ? `<p class="note"><strong>Nota del QA:</strong> ${escapeHtml(finding.decision.note)}</p>` : ''}
      <p class="meta">${meta.map(escapeHtml).join(' · ')}</p>
    </article>`;
}

const STYLES = `
  * { box-sizing: border-box; }
  body { margin: 0; font-family: 'Segoe UI', Arial, sans-serif; font-size: 10.5pt; color: #1a1f1c; line-height: 1.45; }
  a { color: #2f7fbf; word-break: break-all; }
  h1 { margin: 2px 0 6px; font-size: 20pt; }
  h2 { margin: 22px 0 8px; padding-bottom: 4px; border-bottom: 1px solid #d9dcd6; font-size: 13pt; }
  h3.cat { margin: 16px 0 6px; font-size: 11pt; color: #3d4540; text-transform: uppercase; letter-spacing: 0.04em; }
  h4 { margin: 0; font-size: 10.5pt; }
  p { margin: 4px 0; }
  .brand { font-size: 8pt; letter-spacing: 0.12em; color: #d9481f; font-weight: 700; }
  .meta { color: #5f6863; font-size: 9pt; }
  .url, .subject { font-family: Consolas, 'Courier New', monospace; font-size: 8.5pt; color: #5f6863; word-break: break-all; }
  .summary { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 16px; }
  .card { flex: 1 1 0; min-width: 70px; padding: 8px 10px; border: 1px solid #d9dcd6; border-radius: 6px; text-align: center; }
  .num { display: block; font-size: 17pt; font-weight: 700; }
  .card span:last-child { font-size: 8.5pt; color: #5f6863; }
  .notice { margin-top: 10px; padding: 8px 10px; background: #f1f2ef; border-radius: 6px; font-size: 9pt; color: #3d4540; }
  .statement { font-weight: 600; }
  table.criteria { width: 100%; border-collapse: collapse; margin: 6px 0; }
  table.criteria td { padding: 4px 6px; border-bottom: 1px solid #e8eae5; vertical-align: top; }
  table.criteria td:first-child { width: 42px; font-family: Consolas, monospace; font-size: 9pt; color: #5f6863; }
  .finding { break-inside: avoid; margin: 8px 0; padding: 8px 10px; border: 1px solid #e8eae5; border-left: 4px solid; border-radius: 4px; }
  .finding-head { display: flex; align-items: center; gap: 8px; }
  .sev { flex-shrink: 0; padding: 1px 6px; border-radius: 3px; color: #ffffff; font-size: 7.5pt; font-weight: 700; text-transform: uppercase; }
  .tag { padding: 1px 6px; border: 1px solid #2e7d4f; border-radius: 3px; color: #2e7d4f; font-size: 7.5pt; font-weight: 700; }
  .rec { color: #3d4540; }
  td.verdict { width: 92px; text-align: right; }
  .v { display: inline-block; padding: 1px 8px; border-radius: 3px; color: #ffffff; font-size: 8pt; font-weight: 700; white-space: nowrap; }
  .crit-note { color: #3d4540; font-size: 9pt; }
  .marks { color: #5f6863; font-size: 8.5pt; }
  .note { color: #2e7d4f; }
  ul.dismissed { margin: 4px 0; padding-left: 18px; color: #5f6863; }
  .empty { color: #5f6863; }
  .generated { margin-top: 12px; color: #8a938d; font-size: 8.5pt; }
`;

/** Informe de la sesión en HTML estático, listo para imprimir a PDF. */
export function buildReportHtml({ session, analysis, review, generatedAt }: SessionReportData): string {
  const { objective, capture, stats } = session;
  const criteriaTotal = objective.criteria.length;
  const criteria = summarizeCriteria(
    objective.criteria.map((criterion) => criterion.id),
    review,
  );
  const looseMarkers = review.markers.filter((marker) => marker.criterionId === null);
  const verdictNotice =
    criteria.pending === criteriaTotal
      ? 'Los criterios todavía no tienen veredicto del QA.'
      : `El resultado de cada criterio lo decidió el QA${criteria.pending > 0 ? ` (${criteria.pending} ${criteria.pending === 1 ? 'pendiente' : 'pendientes'})` : ''}.`;
  const criteriaColor =
    criteria.fail > 0 ? VERDICT_COLORS.fail : criteria.pass === criteriaTotal ? VERDICT_COLORS.pass : '#1a1f1c';
  const active = analysis.findings.filter((finding) => finding.decision?.decision !== 'dismissed');
  const dismissed = analysis.findings.filter((finding) => finding.decision?.decision === 'dismissed');
  const confirmed = active.filter((finding) => finding.decision?.decision === 'confirmed').length;
  const startedAt = session.startedAt ? new Date(session.startedAt) : null;
  const durationMs = startedAt && session.endedAt ? new Date(session.endedAt).getTime() - startedAt.getTime() : null;

  const meta = [
    capture.environment,
    TEST_TYPE_LABELS[objective.testType],
    STATUS_LABELS[session.status],
    startedAt && dateFormat.format(startedAt),
    durationMs !== null && `Duró ${duration(durationMs)}`,
    objective.linkedIssue && `Historia ${objective.linkedIssue}`,
  ].filter(isText);

  const cards = [
    `<div class="card"><span class="num" style="color:${criteriaColor}">${criteria.pass}/${criteriaTotal}</span><span>criterios cumplen</span></div>`,
    `<div class="card"><span class="num">${active.length}</span><span>hallazgos</span></div>`,
    ...FINDING_SEVERITIES.map((severity) => {
      const count = active.filter((finding) => finding.severity === severity).length;
      return `<div class="card"><span class="num" style="color:${SEVERITY_COLORS[severity]}">${count}</span><span>${FINDING_SEVERITY_LABELS[severity].toLowerCase()}</span></div>`;
    }),
    `<div class="card"><span class="num">${confirmed}</span><span>confirmados</span></div>`,
    `<div class="card"><span class="num">${stats.errors}</span><span>errores capturados</span></div>`,
  ];

  const scope = [
    objective.scope.include.length > 0 &&
      `<p><strong>Incluye:</strong> ${objective.scope.include.map(escapeHtml).join(', ')}</p>`,
    objective.scope.exclude.length > 0 &&
      `<p><strong>Fuera del alcance:</strong> ${objective.scope.exclude.map(escapeHtml).join(', ')}</p>`,
    objective.testData && `<p><strong>Datos de prueba:</strong> ${escapeHtml(objective.testData)}</p>`,
  ].filter(isText);

  const sections = CATEGORY_ORDER.map((category) => ({
    category,
    items: active.filter((finding) => finding.category === category),
  })).filter((section) => section.items.length > 0);

  const skipped = analysis.skipped.map(
    (item) => `${RULE_CATALOG[item.ruleId].title} (${item.reason.replace(/\.$/, '').toLowerCase()})`,
  );

  return `<!doctype html>
<html lang="es">
<head><meta charset="utf-8"><title>${escapeHtml(objective.sessionName)}</title><style>${STYLES}</style></head>
<body>
  <header>
    <p class="brand">RASTRO · INFORME DE SESIÓN</p>
    <h1>${escapeHtml(objective.sessionName)}</h1>
    <p class="meta">${meta.map(escapeHtml).join(' · ')}</p>
    <p class="url">${escapeHtml(capture.startUrl)}</p>
  </header>

  <section class="summary">${cards.join('')}</section>
  <p class="notice">${verdictNotice} Los hallazgos salen de ${analysis.rulesRun} reglas fijas (sin IA) aplicadas a lo grabado.</p>

  <section>
    <h2>Objetivo</h2>
    <p class="statement">${escapeHtml(objective.statement)}</p>
    <table class="criteria">
      ${objective.criteria
        .map((criterion) => {
          const result = review.criteria[criterion.id];
          const marks = review.markers.filter((marker) => marker.criterionId === criterion.id);
          return `<tr>
            <td>${escapeHtml(criterion.id)}</td>
            <td>${escapeHtml(criterion.text)}${result?.note ? `<p class="crit-note">${escapeHtml(result.note)}</p>` : ''}${marks.length > 0 ? `<p class="marks">Marcas: ${markerList(marks)}</p>` : ''}</td>
            <td class="verdict"><span class="v" style="background:${VERDICT_COLORS[result?.verdict ?? 'pending']}">${result ? CRITERION_VERDICT_LABELS[result.verdict] : 'Pendiente'}</span></td>
          </tr>`;
        })
        .join('')}
    </table>
    ${scope.join('')}
  </section>

  ${
    looseMarkers.length > 0
      ? `<section><h2>Notas del QA</h2><ul class="dismissed">${looseMarkers
          .map((marker) => `<li>${clock(marker.t)} — ${escapeHtml(marker.note)}</li>`)
          .join('')}</ul></section>`
      : ''
  }

  <section>
    <h2>Hallazgos</h2>
    ${
      sections.length === 0
        ? '<p class="empty">Las reglas no encontraron nada que señalar en esta sesión.</p>'
        : sections
            .map(
              (section) =>
                `<h3 class="cat">${FINDING_CATEGORY_LABELS[section.category]} · ${section.items.length}</h3>${section.items.map(findingBlock).join('')}`,
            )
            .join('')
    }
  </section>

  ${
    dismissed.length > 0
      ? `<section><h2>Descartados por el QA · ${dismissed.length}</h2><ul class="dismissed">${dismissed
          .map(
            (finding) =>
              `<li>${escapeHtml(finding.title)}${finding.decision?.note ? ` — ${escapeHtml(finding.decision.note)}` : ''}</li>`,
          )
          .join('')}</ul></section>`
      : ''
  }

  <section>
    <h2>Cobertura</h2>
    <p>Se evaluaron ${analysis.rulesRun} reglas. Actividad grabada: ${stats.actions} acciones, ${stats.requests} requests, ${stats.wsFrames} mensajes en tiempo real y ${stats.consoleLogs} mensajes de consola.</p>
    ${skipped.length > 0 ? `<p>Sin evaluar: ${skipped.map(escapeHtml).join('; ')}.</p>` : ''}
    <p class="generated">Generado el ${escapeHtml(dateFormat.format(generatedAt))} con Rastro.</p>
  </section>
</body>
</html>`;
}
