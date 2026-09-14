import { FINDING_SEVERITY_LABELS, RULE_CATALOG, type Finding, type SessionDto } from '@rastro/shared';
import { formatClock } from '../../shared/lib/format';

/** Ticket en Markdown a partir de un hallazgo: se pega bien en Jira, Linear, Azure DevOps o GitHub. */
export function findingToTicket(finding: Finding, session: SessionDto): string {
  const { objective, capture } = session;
  const steps = [
    `Abrir ${capture.startUrl}`,
    ...(finding.afterAction ? [finding.afterAction.label] : []),
    `Observar: ${finding.title}`,
  ];
  const lines = [
    `## [${FINDING_SEVERITY_LABELS[finding.severity]}] ${finding.title}`,
    '',
    `**Sesión:** ${objective.sessionName} · **Ambiente:** ${capture.environment}` +
      (objective.linkedIssue ? ` · **Historia:** ${objective.linkedIssue}` : ''),
    `**Cuándo:** ${formatClock(finding.firstAt)} de la grabación` +
      (finding.afterAction ? `, después de: ${finding.afterAction.label}` : ''),
    ...(finding.subject ? [`**Afecta a:** \`${finding.subject}\``] : []),
    '',
    '### Qué pasa',
    finding.detail,
    ...(finding.recommendation ? ['', '### Recomendación', finding.recommendation] : []),
    '',
    '### Pasos para reproducir',
    ...steps.map((step, index) => `${index + 1}. ${step}`),
    ...(finding.decision?.note ? ['', '### Nota del QA', finding.decision.note] : []),
    '',
    '### Evidencia',
    `- Detectado por la regla «${RULE_CATALOG[finding.ruleId].title}» de Rastro (reglas fijas, sin IA).`,
    `- ${finding.occurrences === 1 ? '1 ocurrencia' : `${finding.occurrences} ocurrencias`} entre ${formatClock(finding.firstAt)} y ${formatClock(finding.lastAt)}.`,
    `- Sesión ${session.id} · hallazgo ${finding.id}.`,
  ];
  return lines.join('\n');
}
