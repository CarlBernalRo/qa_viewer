import {
  compareFindings,
  RULE_CATALOG,
  type CaptureChannel,
  type CaptureEventOf,
  type Finding,
  type RuleId,
  type SessionAnalysis,
} from '@rastro/shared';
import { SessionEvidence, type AnalysisInput } from './evidence.js';
import { clip, type FindingDraft, type Rule } from './rule.js';
import { ALL_RULES } from './rules/index.js';
import { matchesScope } from './url.js';

/** Tope de evidencias por hallazgo; `occurrences` conserva el total real. */
const MAX_EVIDENCE = 50;

const CHANNEL_NAMES: Record<CaptureChannel, string> = {
  actions: 'acciones',
  network: 'red',
  websocket: 'WebSocket',
  console: 'consola',
  performance: 'rendimiento',
  accessibility: 'accesibilidad',
  video: 'video',
  screenshots: 'capturas de pantalla',
};

const ACTION_VERBS: Record<CaptureEventOf<'user-action'>['action'], string> = {
  click: 'Click en',
  input: 'Escribe en',
  change: 'Cambia',
  submit: 'Envía',
  keydown: 'Tecla en',
};

function actionLabel(action: CaptureEventOf<'user-action'>): string {
  // Una etiqueta vacía (un input sin placeholder ni label) no dice nada: se usa el selector.
  const target = clip(action.label?.trim() ? action.label : action.selector, 60);
  if (action.action === 'keydown' && action.key) return `Tecla ${action.key} en «${target}»`;
  return `${ACTION_VERBS[action.action]} «${target}»`;
}

/** FNV-1a: un id corto y estable a partir de la clave del hallazgo. */
function shortHash(text: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

function toFinding(
  ruleId: RuleId,
  draft: FindingDraft,
  evidence: SessionEvidence,
  exclude: readonly string[],
): Finding | null {
  const events = draft.evidence;
  if (events.length === 0) return null;
  const moments = events.map((event) => event.t);
  const firstAt = Math.min(...moments);
  const action = evidence.actionBefore(firstAt);
  const urls = draft.urls ?? [];
  return {
    id: `${ruleId}:${shortHash(draft.key)}`,
    ruleId,
    source: 'rule',
    category: RULE_CATALOG[ruleId].category,
    severity: draft.severity,
    title: draft.title,
    ...(draft.subject ? { subject: draft.subject } : {}),
    detail: draft.detail,
    ...(draft.recommendation ? { recommendation: draft.recommendation } : {}),
    occurrences: draft.occurrences ?? events.length,
    firstAt,
    lastAt: Math.max(...moments),
    evidence: events.slice(0, MAX_EVIDENCE).map((event) => event.id),
    ...(action ? { afterAction: { eventId: action.id, label: actionLabel(action), t: action.t } } : {}),
    outOfScope:
      exclude.length > 0 &&
      urls.length > 0 &&
      urls.every((url) => exclude.some((pattern) => matchesScope(url, pattern))),
  };
}

/**
 * Análisis determinista de una sesión: corre las reglas fijas sobre los eventos
 * grabados y devuelve hallazgos agrupados, ordenados y con su evidencia.
 */
export function analyzeSession(
  input: AnalysisInput & { sessionId: string; now: Date },
  rules: readonly Rule[] = ALL_RULES,
): SessionAnalysis {
  const evidence = new SessionEvidence(input);
  const captured = new Set(input.capture.channels);
  const findings: Finding[] = [];
  const skipped: SessionAnalysis['skipped'] = [];
  const ids = new Set<string>();
  let rulesRun = 0;

  for (const rule of rules) {
    const missing = RULE_CATALOG[rule.id].requires.filter((channel) => !captured.has(channel));
    if (missing.length > 0) {
      skipped.push({
        ruleId: rule.id,
        reason: `No se capturó el canal de ${missing.map((channel) => CHANNEL_NAMES[channel]).join(' ni ')}.`,
      });
      continue;
    }
    rulesRun += 1;
    for (const draft of rule.run(evidence)) {
      const finding = toFinding(rule.id, draft, evidence, input.objective.scope.exclude);
      if (!finding) continue;
      // Dos claves distintas con el mismo hash: se desempata sin perder estabilidad.
      let id = finding.id;
      for (let suffix = 2; ids.has(id); suffix += 1) id = `${finding.id}-${suffix}`;
      ids.add(id);
      findings.push({ ...finding, id });
    }
  }

  return {
    sessionId: input.sessionId,
    generatedAt: input.now.toISOString(),
    rulesRun,
    skipped,
    findings: findings.sort(compareFindings),
  };
}
