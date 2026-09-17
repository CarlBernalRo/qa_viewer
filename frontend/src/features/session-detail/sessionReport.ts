import {
  CRITERION_VERDICT_LABELS,
  FINDING_SEVERITY_LABELS,
  PROPOSED_VERDICT_LABELS,
  type AgentRun,
  type SessionAnalysis,
  type SessionDto,
  type SessionReview,
} from '@rastro/shared';
import { formatClock, formatDate } from '../../shared/lib/format';

/**
 * Informe de toda la sesión en Markdown, para pegar en Jira, Linear, Slack o Teams: objetivo, veredicto
 * por criterio, hallazgos confirmados y, si los hay, el resumen y la propuesta de los agentes.
 * Es lo que haría el agente Reportero de la visión de producto — hoy sin IA, armado con lo que ya se sabe.
 */
export function sessionToReport(
  session: SessionDto,
  review: SessionReview,
  analysis: SessionAnalysis | undefined,
  latestAgentRun: AgentRun | undefined,
): string {
  const { objective, capture } = session;
  const active = (analysis?.findings ?? []).filter((finding) => finding.decision?.decision !== 'dismissed');
  const confirmed = active.filter((finding) => finding.decision?.decision === 'confirmed');

  const lines = [
    `# ${objective.sessionName}`,
    '',
    `**Ambiente:** ${capture.environment} · **Creada:** ${formatDate(session.createdAt)}` +
      (objective.linkedIssue ? ` · **Historia:** ${objective.linkedIssue}` : ''),
    '',
    '## Objetivo',
    objective.statement,
    '',
    '## Criterios de aceptación',
    ...objective.criteria.map((criterion) => {
      const result = review.criteria[criterion.id];
      const verdict = result ? CRITERION_VERDICT_LABELS[result.verdict] : 'Pendiente';
      return `- **${criterion.id}** (${verdict}): ${criterion.text}${result?.note ? ` — _${result.note}_` : ''}`;
    }),
  ];

  lines.push('', `## Hallazgos confirmados (${confirmed.length})`);
  if (confirmed.length === 0) {
    lines.push('Ninguno todavía.');
  } else {
    for (const finding of confirmed) {
      lines.push(
        '',
        `### [${FINDING_SEVERITY_LABELS[finding.severity]}] ${finding.title}`,
        finding.detail,
        ...(finding.recommendation ? [`**Recomendación:** ${finding.recommendation}`] : []),
        ...(finding.decision?.note ? [`**Nota del QA:** ${finding.decision.note}`] : []),
        `_Desde ${formatClock(finding.firstAt)} de la grabación · ${finding.occurrences === 1 ? '1 ocurrencia' : `${finding.occurrences} ocurrencias`}._`,
      );
    }
  }

  if (latestAgentRun?.status === 'completed') {
    lines.push('', '## Propuesta de los agentes', `_Sin aplicar: el veredicto real es el de "Criterios de aceptación" arriba._`);
    if (latestAgentRun.summary) lines.push('', latestAgentRun.summary);
    if (latestAgentRun.proposals.length > 0) {
      lines.push(
        '',
        ...latestAgentRun.proposals.map(
          (proposal) => `- **${proposal.criterionId}**: ${PROPOSED_VERDICT_LABELS[proposal.verdict]} — ${proposal.rationale}`,
        ),
      );
    }
  }

  lines.push('', '---', `Sesión ${session.id} · grabada con Rastro.`);
  return lines.join('\n');
}
