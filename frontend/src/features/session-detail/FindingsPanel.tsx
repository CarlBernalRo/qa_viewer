import {
  RULE_CATALOG,
  type Finding,
  type FindingCategory,
  type FindingDecisionValue,
  type SessionAnalysis,
  type SessionDto,
} from '@rastro/shared';
import { useMemo, useState } from 'react';
import { findingToTicket } from './findingTicket';
import { useSetFindingDecision } from '../sessions/api';
import { cx } from '../../shared/lib/cx';
import { formatClock } from '../../shared/lib/format';
import { FINDING_CATEGORY_LABELS, FINDING_SEVERITY_LABELS } from '../../shared/lib/labels';
import { ErrorMessage, InfoTip, Panel } from '../../shared/ui';
import styles from './FindingsPanel.module.css';

interface FindingsPanelProps {
  session: SessionDto;
  analysis: SessionAnalysis | undefined;
  loading: boolean;
  error: unknown;
  selectedEventId: string | null;
  onSelectEvidence: (eventId: string) => void;
}

/** Reglas omitidas agrupadas por motivo, con su nombre legible en vez del id interno. */
function groupSkipped(skipped: SessionAnalysis['skipped']): Map<string, string[]> {
  const byReason = new Map<string, string[]>();
  for (const { ruleId, reason } of skipped) {
    const titles = byReason.get(reason) ?? [];
    titles.push(RULE_CATALOG[ruleId].title);
    byReason.set(reason, titles);
  }
  return byReason;
}

const CATEGORY_ORDER: readonly FindingCategory[] = [
  'network',
  'security',
  'accessibility',
  'frontend',
  'realtime',
  'performance',
  'functional',
];

function DecisionBar({
  finding,
  pending,
  onDecide,
  ticket,
}: {
  finding: Finding;
  pending: boolean;
  onDecide: (decision: FindingDecisionValue | null) => void;
  /** Arma el ticket para copiar (solo en los confirmados). */
  ticket: () => string;
}) {
  const [copied, setCopied] = useState(false);
  const copyTicket = () => {
    void navigator.clipboard
      .writeText(ticket())
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => undefined);
  };

  if (finding.decision) {
    return (
      <div className={styles.decisionBar}>
        <span className={cx(styles.decisionTag, styles[`decision_${finding.decision.decision}`])}>
          {finding.decision.decision === 'confirmed' ? '✓ Confirmado' : '✕ Descartado'}
        </span>
        {finding.decision.decision === 'confirmed' && (
          <button
            type="button"
            className={styles.decisionButton}
            title="Copia un ticket en Markdown para pegar en Jira, Linear, Azure DevOps o GitHub"
            onClick={copyTicket}
          >
            {copied ? '¡Copiado!' : 'Copiar ticket'}
          </button>
        )}
        <button type="button" className={styles.decisionLink} disabled={pending} onClick={() => onDecide(null)}>
          Deshacer
        </button>
      </div>
    );
  }
  return (
    <div className={styles.decisionBar}>
      <button type="button" className={styles.decisionButton} disabled={pending} onClick={() => onDecide('confirmed')}>
        Confirmar
      </button>
      <button
        type="button"
        className={cx(styles.decisionButton, styles.decisionDismiss)}
        disabled={pending}
        onClick={() => onDecide('dismissed')}
      >
        Descartar
      </button>
    </div>
  );
}

function FindingRow({
  finding,
  selected,
  deciding,
  onSelect,
  onDecide,
  ticket,
}: {
  finding: Finding;
  selected: boolean;
  deciding: boolean;
  onSelect: () => void;
  onDecide: (decision: FindingDecisionValue | null) => void;
  ticket: () => string;
}) {
  const [firstEvidence] = finding.evidence;
  return (
    <li
      className={cx(
        styles.row,
        selected && styles.rowSelected,
        finding.outOfScope && styles.rowOutOfScope,
        finding.decision?.decision === 'dismissed' && styles.rowDismissed,
      )}
    >
      <button type="button" className={styles.rowButton} onClick={onSelect} disabled={!firstEvidence}>
        <span className={cx(styles.severity, styles[finding.severity])}>{FINDING_SEVERITY_LABELS[finding.severity]}</span>
        <span className={styles.rowMain}>
          <span className={styles.rowTitle}>
            {finding.title}
            {finding.occurrences > 1 && <span className={styles.occurrences}>×{finding.occurrences}</span>}
            {finding.outOfScope && <span className={styles.outOfScopeTag}>fuera de alcance</span>}
          </span>
          <span className={styles.rowDetail}>{finding.detail}</span>
          {finding.recommendation && <span className={styles.recommendation}>💡 {finding.recommendation}</span>}
          {finding.afterAction && (
            <span className={styles.afterAction}>
              Después de: {finding.afterAction.label} · {formatClock(finding.afterAction.t)}
            </span>
          )}
        </span>
        <span className={styles.rowTime}>{formatClock(finding.firstAt)}</span>
      </button>
      <DecisionBar finding={finding} pending={deciding} onDecide={onDecide} ticket={ticket} />
    </li>
  );
}

/** Hallazgos de las reglas fijas (sin IA): agrupados por categoría, con su evidencia. */
export function FindingsPanel({ session, analysis, loading, error, selectedEventId, onSelectEvidence }: FindingsPanelProps) {
  const [category, setCategory] = useState<FindingCategory | 'all'>('all');
  const [showDismissed, setShowDismissed] = useState(false);
  const [decidingId, setDecidingId] = useState<string | null>(null);
  const decide = useSetFindingDecision(session.id);
  const findings = useMemo(() => analysis?.findings ?? [], [analysis]);

  const counts = useMemo(() => {
    const byCategory = new Map<FindingCategory, number>();
    for (const finding of findings) byCategory.set(finding.category, (byCategory.get(finding.category) ?? 0) + 1);
    return byCategory;
  }, [findings]);

  const dismissedCount = findings.filter((finding) => finding.decision?.decision === 'dismissed').length;
  const byCategory = category === 'all' ? findings : findings.filter((finding) => finding.category === category);
  const visible = showDismissed ? byCategory : byCategory.filter((finding) => finding.decision?.decision !== 'dismissed');
  const presentCategories = CATEGORY_ORDER.filter((item) => counts.has(item));

  const handleDecide = (findingId: string, decision: FindingDecisionValue | null) => {
    setDecidingId(findingId);
    decide.mutate(
      { findingId, decision },
      { onSettled: () => setDecidingId((current) => (current === findingId ? null : current)) },
    );
  };

  return (
    <Panel
      collapsibleKey="findings"
      title="Hallazgos"
      subtitle={
        analysis
          ? `${findings.length} hallazgos · ${analysis.rulesRun} reglas evaluadas`
          : loading
            ? 'Evaluando…'
            : undefined
      }
      actions={
        <InfoTip label="Qué son los hallazgos">
          Reglas fijas y deterministas (sin IA) sobre lo grabado: errores de red, headers de seguridad, cookies,
          credenciales en la URL, excepciones, errores de socket y Web Vitals. Cada una explica qué revisa y por qué
          importa.
        </InfoTip>
      }
      padded={false}
    >
      {loading ? (
        <p className={cx(styles.muted, styles.pad)}>Evaluando la sesión…</p>
      ) : error ? (
        <div className={styles.pad}>
          <ErrorMessage error={error} />
        </div>
      ) : !analysis || findings.length === 0 ? (
        <p className={cx(styles.muted, styles.pad)}>
          {analysis ? 'Las reglas no encontraron nada que señalar en esta sesión.' : 'No se pudo evaluar la sesión.'}
        </p>
      ) : (
        <>
          {(presentCategories.length > 1 || dismissedCount > 0) && (
            <div className={styles.categoryTabs}>
              {presentCategories.length > 1 && (
                <>
                  <button
                    type="button"
                    className={cx(styles.categoryTab, category === 'all' && styles.categoryTabActive)}
                    onClick={() => setCategory('all')}
                  >
                    Todas ({findings.length})
                  </button>
                  {presentCategories.map((item) => (
                    <button
                      key={item}
                      type="button"
                      className={cx(styles.categoryTab, category === item && styles.categoryTabActive)}
                      onClick={() => setCategory(item)}
                    >
                      {FINDING_CATEGORY_LABELS[item]} ({counts.get(item)})
                    </button>
                  ))}
                </>
              )}
              {dismissedCount > 0 && (
                <button
                  type="button"
                  className={cx(styles.categoryTab, styles.dismissedToggle)}
                  onClick={() => setShowDismissed((current) => !current)}
                >
                  {showDismissed ? 'Ocultar descartados' : `Mostrar descartados (${dismissedCount})`}
                </button>
              )}
            </div>
          )}
          {decide.error && (
            <div className={styles.pad}>
              <ErrorMessage error={decide.error} />
            </div>
          )}
          {visible.length === 0 ? (
            <p className={cx(styles.muted, styles.pad)}>Sin hallazgos para mostrar con este filtro.</p>
          ) : (
            <ul className={styles.list}>
              {visible.map((finding) => (
                <FindingRow
                  key={finding.id}
                  finding={finding}
                  selected={finding.evidence[0] === selectedEventId}
                  deciding={decidingId === finding.id}
                  onSelect={() => {
                    const [eventId] = finding.evidence;
                    if (eventId) onSelectEvidence(eventId);
                  }}
                  onDecide={(decision) => handleDecide(finding.id, decision)}
                  ticket={() => findingToTicket(finding, session)}
                />
              ))}
            </ul>
          )}
          {analysis.skipped.length > 0 && (
            <div className={cx(styles.muted, styles.pad, styles.skippedNote)}>
              {[...groupSkipped(analysis.skipped)].map(([reason, titles]) => (
                <p key={reason}>
                  <strong>Sin evaluar:</strong> {titles.join(', ')}. {reason} Actívalo al crear una sesión nueva para
                  revisarlo.
                </p>
              ))}
            </div>
          )}
        </>
      )}
    </Panel>
  );
}
