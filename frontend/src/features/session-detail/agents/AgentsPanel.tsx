import {
  AGENT_ORDER,
  FINDING_SEVERITY_LABELS,
  PROPOSED_VERDICT_LABELS,
  SPECIALIST_ASSESSMENT_LABELS,
  type AgentFinding,
  type AgentRun,
  type AgentStatus,
  type AgentStep,
  type FindingSeverity,
  type SessionDto,
  type SpecialistId,
} from '@rastro/shared';
import { useEffect, useState, type CSSProperties } from 'react';
import { cx } from '../../../shared/lib/cx';
import { formatClock } from '../../../shared/lib/format';
import { ErrorMessage, Field, InfoTip, Panel, TextArea } from '../../../shared/ui';
import { useAgentCatalog } from '../../agents-overview/AgentCatalogContext';
import { useStartAgentRun } from '../../sessions/api';
import { AgentAvatar } from './AgentAvatar';
import { AgentTooltip } from './AgentTooltip';
import styles from './AgentsPanel.module.css';

const STEP_LABELS: Record<AgentStep['status'], string> = {
  pending: 'En espera',
  running: 'Analizando…',
  done: 'Listo',
  failed: 'Falló',
};

function Team({ onRunAgent, disabled }: { onRunAgent?: (id: SpecialistId) => void; disabled?: boolean }) {
  const { catalog } = useAgentCatalog();
  return (
    <ul className={styles.team}>
      {AGENT_ORDER.map((agent) => (
        <li key={agent} className={styles.member}>
          <AgentTooltip agent={agent}>
            <AgentAvatar agent={agent} size={32} />
          </AgentTooltip>
          <span className={styles.memberText}>
            <strong>{catalog[agent].name}</strong>
            <span>{catalog[agent].role}</span>
            <span className={styles.reads}>Lee: {catalog[agent].reads}</span>
          </span>
          {agent !== 'lead' && onRunAgent && (
            <button 
              type="button" 
              className={styles.runAgentBtn}
              onClick={() => onRunAgent(agent as SpecialistId)}
              disabled={disabled}
              title={`Ejecutar solo al agente de ${catalog[agent].name}`}
            >
              ▶
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

function NotConfigured() {
  return (
    <p className={styles.notice}>
      Los agentes necesitan una clave de API: de Google Gemini (se crea en Google AI Studio) o de OpenRouter. Agrégala en{' '}
      <span className="mono">backend/.env</span> como <span className="mono">GEMINI_API_KEY=…</span> u{' '}
      <span className="mono">OPENROUTER_API_KEY=…</span> y reinicia Rastro. Sin clave, todo lo demás sigue funcionando con
      las reglas fijas.
    </p>
  );
}

function LeadStep({ step, specialistSteps }: { step: AgentStep; specialistSteps: readonly AgentStep[] }) {
  const { catalog } = useAgentCatalog();
  const busy = step.status === 'running';
  const color = catalog.lead.color;
  const done = specialistSteps.filter((item) => item.status === 'done');
  return (
    <div
      className={cx(styles.leadStep, styles[`leadStep_${step.status}`])}
      style={{ '--agent-color': color } as CSSProperties}
    >
      <AgentAvatar agent="lead" size={40} busy={busy} />
      <div className={styles.leadText}>
        <div className={styles.leadHead}>
          <strong>{catalog.lead.name}</strong>
          <span className={styles.leadBadge}>Orquestador</span>
          <span className={cx(styles.stepStatus, styles[`stepStatus_${step.status}`])}>
            {busy && <span className={styles.stepStatusDot} aria-hidden="true" />}
            {STEP_LABELS[step.status]}
          </span>
        </div>
        {busy && done.length > 0 && (
          <div className={styles.teamFlow} aria-hidden="true">
            <ul className={styles.teamFlowAvatars}>
              {done.map((item) => (
                <li key={item.agentId} className={styles.teamFlowAvatar} style={{ '--agent-color': catalog[item.agentId].color } as CSSProperties}>
                  <AgentAvatar agent={item.agentId} size={18} />
                  <span className={styles.teamFlowTrack}>
                    <span className={styles.dataFlowLine} />
                    <span className={styles.dataFlowDot} />
                  </span>
                </li>
              ))}
            </ul>
            <span className={styles.teamFlowLabel}>uniendo {done.length} informe{done.length === 1 ? '' : 's'} en uno solo</span>
          </div>
        )}
        {step.summary && <span className={styles.leadSummary}>{step.summary}</span>}
        {step.error && <span className={styles.stepError}>{step.error}</span>}
      </div>
    </div>
  );
}

function Steps({ run, onRunAgent, disabled }: { run: AgentRun; onRunAgent?: (id: SpecialistId) => void; disabled?: boolean }) {
  const { catalog } = useAgentCatalog();
  const leadStep = run.steps.find((step) => step.agentId === 'lead');
  const specialistSteps = run.steps.filter((step) => step.agentId !== 'lead');
  return (
    <div className={styles.stepsWrap}>
      {leadStep && <LeadStep step={leadStep} specialistSteps={specialistSteps} />}
      <ol className={styles.steps}>
        {specialistSteps.map((step) => {
          const busy = step.status === 'running';
          const color = catalog[step.agentId].color;
          return (
            <li
              key={step.agentId}
              className={cx(styles.step, styles[`step_${step.status}`])}
              style={{ '--agent-color': color } as CSSProperties}
            >
              <span className={cx(styles.stepAvatar, busy && styles.stepAvatarBusy)}>
                <AgentTooltip agent={step.agentId} extra={STEP_LABELS[step.status]}>
                  <AgentAvatar agent={step.agentId} size={28} busy={busy} />
                </AgentTooltip>
              </span>
              <span className={styles.stepText}>
                <span className={styles.stepHead}>
                  <strong>{catalog[step.agentId].name}</strong>
                  <span className={cx(styles.stepStatus, styles[`stepStatus_${step.status}`])}>
                    {busy && <span className={styles.stepStatusDot} aria-hidden="true" />}
                    {STEP_LABELS[step.status]}
                  </span>
                  {step.status !== 'running' && onRunAgent && (
                    <button 
                      type="button" 
                      className={styles.runAgentBtn}
                      onClick={() => onRunAgent(step.agentId as SpecialistId)}
                      disabled={disabled}
                      title={`Ejecutar solo al agente de ${catalog[step.agentId].name}`}
                    >
                      ▶
                    </button>
                  )}
                </span>
                {busy && (
                  <span className={styles.dataFlow} aria-hidden="true">
                    <AgentAvatar agent={step.agentId} size={16} />
                    <span className={styles.dataFlowTrack}>
                      <span className={styles.dataFlowLine} />
                      <span className={styles.dataFlowDot} />
                    </span>
                    <AgentAvatar agent="lead" size={16} />
                    <span className={styles.dataFlowLabel}>preparando informe para el QA Lead</span>
                  </span>
                )}
                {step.summary && <span className={styles.stepSummary}>{step.summary}</span>}
                {step.error && <span className={styles.stepError}>{step.error}</span>}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function FindingItem({
  finding,
  eventTime,
  onSelectEvidence,
}: {
  finding: AgentFinding;
  eventTime: (eventId: string) => number | undefined;
  onSelectEvidence: (eventId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={cx(styles.finding, styles[`finding_${finding.severity}`], expanded && styles.findingExpanded)}>
      <button type="button" className={styles.findingHead} onClick={() => setExpanded(!expanded)} aria-expanded={expanded}>
        <span className={styles.findingBullet} aria-hidden="true" />
        <span className={styles.findingTitleWrap}>
          <strong className={styles.findingTitle}>{finding.title}</strong>
        </span>
        <span className={styles.findingAgents}>
          {finding.agents.map((agent) => (
            <AgentTooltip key={agent} agent={agent}>
              <AgentAvatar agent={agent} size={20} />
            </AgentTooltip>
          ))}
        </span>
        <span className={styles.findingChevron} aria-hidden="true">{expanded ? '▲' : '▼'}</span>
      </button>
      
      {expanded && (
        <div className={styles.findingBody}>
          <p className={styles.findingDetail}>{finding.detail}</p>
          {finding.recommendation && (
            <p className={styles.findingRecommendation}>
              <span className={styles.findingRecommendationLabel}>Recomendación:</span> <em>{finding.recommendation}</em>
            </p>
          )}
          <div className={styles.findingMeta}>
            {finding.criterionId && <span className={styles.criterionTag}>{finding.criterionId}</span>}
            {finding.evidence.map((eventId) => {
              const t = eventTime(eventId);
              return (
                <button key={eventId} type="button" className={styles.evidence} onClick={() => onSelectEvidence(eventId)}>
                  📎 {t === undefined ? 'evento' : formatClock(t)}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/** Corta un párrafo en oraciones para mostrarlas como viñetas, sin tocar el texto real del agente. */
function toBullets(text: string): string[] {
  const sentences = text
    .split(/(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÑ0-9])/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  return sentences.length > 0 ? sentences : [text];
}

/** 0-49 crítico, 50-79 con reservas, 80-100 aprobado: mismos cortes que la severidad de hallazgos. */
function approvalTone(percentage: number): 'crit' | 'warn' | 'ok' {
  if (percentage < 50) return 'crit';
  if (percentage < 80) return 'warn';
  return 'ok';
}

function ApprovalBadge({ percentage }: { percentage: number }) {
  return (
    <span className={cx(styles.approvalBadge, styles[`approval_${approvalTone(percentage)}`])} title="Aprobación de este agente sobre su propio alcance">
      {percentage}%
    </span>
  );
}

function ReasonCard({
  step,
  findings,
  isActive,
}: {
  step: AgentStep;
  findings: readonly AgentFinding[];
  isActive: boolean;
}) {
  const { catalog } = useAgentCatalog();
  const recommendations = [
    ...new Set(
      findings
        .filter((finding) => finding.agents.includes(step.agentId) && finding.recommendation)
        .map((finding) => finding.recommendation),
    ),
  ];
  const agentColor = catalog[step.agentId].color;
  return (
    <div
      className={cx(
        styles.reasonCard,
        step.status === 'failed' && styles.reasonCardFailed,
        isActive && styles.reasonCardActive,
      )}
      style={{ '--agent-color': agentColor } as CSSProperties}
    >
      <div className={styles.reasonCardGlow} aria-hidden="true" />
      <div className={styles.reasonHead}>
        <AgentAvatar agent={step.agentId} size={30} />
        <div className={styles.reasonHeadInfo}>
          <strong>{catalog[step.agentId].name}</strong>
          <span className={styles.reasonRole}>{catalog[step.agentId].role}</span>
        </div>
        {step.approvalPercentage !== undefined && <ApprovalBadge percentage={step.approvalPercentage} />}
      </div>
      {step.summary && (
        <div className={styles.reasonSection}>
          <span className={styles.reasonSectionTitle}>Resumen</span>
          <ul className={styles.reasonBullets}>
            {toBullets(step.summary).map((sentence) => (
              <li key={sentence}>{sentence}</li>
            ))}
          </ul>
        </div>
      )}
      {step.criteria && step.criteria.length > 0 && (
        <div className={styles.reasonSection}>
          <span className={styles.reasonSectionTitle}>Por criterio</span>
          <ul className={styles.reasonBullets}>
            {step.criteria.map((item) => (
              <li key={item.criterionId}>
                <span className={styles.criterionTag}>{item.criterionId}</span>{' '}
                <strong>{SPECIALIST_ASSESSMENT_LABELS[item.assessment]}:</strong> {item.reason}
              </li>
            ))}
          </ul>
        </div>
      )}
      {recommendations.length > 0 && (
        <div className={styles.reasonSection}>
          <span className={styles.reasonSectionTitle}>Recomendación</span>
          <ul className={styles.reasonBullets}>
            {recommendations.map((recommendation) => (
              <li key={recommendation}>
                <em>{recommendation}</em>
              </li>
            ))}
          </ul>
        </div>
      )}
      {step.error && <p className={styles.stepError}>{step.error}</p>}
    </div>
  );
}

/** El resumen de cada especialista se pierde de vista una vez termina el análisis (Steps ya no se muestra); esto lo rescata. */
function AgentReasons({ steps, findings }: { steps: readonly AgentStep[]; findings: readonly AgentFinding[] }) {
  const { catalog } = useAgentCatalog();
  const specialistSteps = steps.filter((step) => step.agentId !== 'lead' && (step.summary || step.error));
  const [index, setIndex] = useState(0);
  useEffect(() => {
    setIndex(0);
  }, [specialistSteps.length]);
  if (specialistSteps.length === 0) return null;
  const active = Math.min(index, specialistSteps.length - 1);
  const go = (next: number) => setIndex((next + specialistSteps.length) % specialistSteps.length);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      go(active - 1);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      go(active + 1);
    }
  };

  return (
    <section className={styles.reasonsSection} onKeyDown={handleKeyDown} tabIndex={-1}>
      <div className={styles.reasonsHeadRow}>
        <div className={styles.reasonsTitleGroup}>
          <span className={styles.reasonsTitleAccent} aria-hidden="true" />
          <h3 className={styles.reasonsTitle}>Por qué cada agente</h3>
        </div>
        {specialistSteps.length > 1 && (
          <div className={styles.reasonsNav}>
            <button type="button" className={styles.reasonsNavBtn} onClick={() => go(active - 1)} aria-label="Agente anterior">
              ‹
            </button>
            <span className={styles.reasonsCounter}>
              {active + 1} / {specialistSteps.length}
            </span>
            <button type="button" className={styles.reasonsNavBtn} onClick={() => go(active + 1)} aria-label="Agente siguiente">
              ›
            </button>
          </div>
        )}
      </div>
      <div className={styles.reasonsViewport}>
        <div className={styles.reasonsTrack} style={{ transform: `translateX(-${active * 100}%)` }}>
          {specialistSteps.map((step, i) => (
            <div
              key={step.agentId}
              className={cx(styles.reasonsSlide, i === active && styles.reasonsSlideActive)}
            >
              <ReasonCard step={step} findings={findings} isActive={i === active} />
            </div>
          ))}
        </div>
      </div>
      {specialistSteps.length > 1 && (
        <div className={styles.reasonsDots}>
          {specialistSteps.map((step, i) => (
            <button
              key={step.agentId}
              type="button"
              className={cx(styles.reasonsDot, i === active && styles.reasonsDotActive)}
              style={{ '--agent-color': catalog[step.agentId].color } as CSSProperties}
              onClick={() => setIndex(i)}
              aria-label={`Ver ${catalog[step.agentId].name}`}
              aria-current={i === active}
            >
              <AgentTooltip agent={step.agentId}>
                <AgentAvatar agent={step.agentId} size={16} />
              </AgentTooltip>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

const SEVERITY_SECTIONS: FindingSeverity[] = ['critical', 'high', 'medium', 'low'];

function FindingsList({
  findings,
  eventTime,
  onSelectEvidence,
}: {
  findings: readonly AgentFinding[];
  eventTime: (eventId: string) => number | undefined;
  onSelectEvidence: (eventId: string) => void;
}) {
  return (
    <div className={styles.findingsSections}>
      {SEVERITY_SECTIONS.map((severity) => {
        const items = findings.filter((finding) => finding.severity === severity);
        if (items.length === 0) return null;
        return (
          <section key={severity} className={styles.findingsSection}>
            <h3 className={cx(styles.findingsSectionTitle, styles[`sectionTitle_${severity}`])}>
              {FINDING_SEVERITY_LABELS[severity]}
              <span className={styles.findingsSectionCount}>{items.length}</span>
            </h3>
            <div className={styles.findingsList}>
              {items.map((finding) => (
                <FindingItem key={finding.id} finding={finding} eventTime={eventTime} onSelectEvidence={onSelectEvidence} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

interface AgentsPanelProps {
  session: SessionDto;
  status: AgentStatus | undefined;
  runs: AgentRun[] | undefined;
  loading: boolean;
  eventTime: (eventId: string) => number | undefined;
  onSelectEvidence: (eventId: string) => void;
}

/** El equipo de agentes: qué hace cada uno, cómo avanza el análisis y qué encontró. */
export function AgentsPanel({ session, status, runs, loading, eventTime, onSelectEvidence }: AgentsPanelProps) {
  const { catalog } = useAgentCatalog();
  const start = useStartAgentRun(session.id);
  const [note, setNote] = useState('');
  const latest = runs?.[0];
  const running = start.isPending || latest?.status === 'running';

  const subtitle = !status
    ? undefined
    : !status.available
      ? 'Sin configurar'
      : running
        ? 'Analizando la sesión…'
        : latest?.status === 'completed'
          ? `${latest.findings.length} observaciones · ${latest.proposals.length} veredictos propuestos`
          : undefined;

  const recommendationField = (
    <Field
      label="Recomendaciones para este análisis"
      optional
      hint="Se le suma al resumen que ven todos los agentes en esta corrida. No se guarda para las próximas."
    >
      {(id) => (
        <TextArea
          id={id}
          value={note}
          disabled={running}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Ej.: presta especial atención al flujo de pago con tarjeta."
          rows={2}
        />
      )}
    </Field>
  );

  const startButton = (label: string) => (
    <button
      type="button"
      className={styles.start}
      disabled={running}
      onClick={() => start.mutate({ ...(note.trim() ? { note: note.trim() } : {}) })}
    >
      {running ? 'Analizando…' : label}
    </button>
  );
  // Al reintentar se retoma desde el primer agente que no terminó.
  const pendingAgent = latest?.steps.find((step) => step.status !== 'done')?.agentId;

  return (
    <Panel
      collapsibleKey="agents"
      title="Agentes"
      {...(subtitle ? { subtitle } : {})}
      actions={
        <InfoTip label="Qué hacen los agentes">
          Agentes de IA que revisan la sesión grabada: 8 especialistas, cada uno con su propia área (API, Front-end,
          Seguridad, Accesibilidad, Rendimiento, Tiempo real, Funcional, Ambiente), y un QA Lead que junta lo que
          encuentran y propone un veredicto por criterio. Tú decides: nada cambia hasta que aceptas una propuesta.
        </InfoTip>
      }
    >
      <ErrorMessage error={start.error} />
      {loading || !status ? (
        <p className={styles.muted}>Cargando…</p>
      ) : !latest ? (
        <div className={styles.stack}>
          {!status.available && <NotConfigured />}
          <Team 
            onRunAgent={status.available && !running ? (agentId) => start.mutate({ agentId, ...(note.trim() ? { note: note.trim() } : {}) }) : undefined}
            disabled={running}
          />
          {status.available && (
            <>
              <p className={styles.consent}>
                Al analizar se envía a {status.provider} un resumen de esta sesión con los datos sensibles ya ocultos: objetivo,
                criterios, tus marcas y veredictos, las llamadas a la API, la consola, la accesibilidad y el rendimiento.
                No se envía el video. Modelo: <span className="mono">{status.model}</span>.
              </p>
              {recommendationField}
              {startButton('Analizar la sesión')}
            </>
          )}
        </div>
      ) : latest.status !== 'completed' ? (
        <div className={styles.stack}>
          <Steps 
            run={latest} 
            onRunAgent={status.available && !running ? (agentId) => start.mutate({ agentId, ...(note.trim() ? { note: note.trim() } : {}) }) : undefined}
            disabled={running}
          />
          {latest.status === 'failed' && (
            <>
              <ErrorMessage error={new Error(latest.error ?? 'El análisis no terminó.')} />
              {status.available ? (
                <div className={styles.retryRow}>
                  <button
                    type="button"
                    className={styles.start}
                    disabled={running}
                    onClick={() => start.mutate({ retryRunId: latest.id })}
                  >
                    {running
                      ? 'Retomando…'
                      : `Reintentar${pendingAgent ? ` desde ${catalog[pendingAgent].name}` : ''}`}
                  </button>
                  <span className={styles.muted}>Los agentes que ya respondieron no se vuelven a consultar.</span>
                </div>
              ) : (
                <NotConfigured />
              )}
            </>
          )}
        </div>
      ) : (
        <div className={styles.stack}>
          {latest.summary && (
            <div className={styles.leadCard}>
              <div className={styles.leadCardGlow} aria-hidden="true" />
              <div className={styles.leadCardBorder} aria-hidden="true" />
              <AgentAvatar agent="lead" size={44} />
              <div className={styles.leadText}>
                <div className={styles.leadHead}>
                  <strong>{catalog.lead.name}</strong>
                  <span className={styles.leadBadge}>Orquestador</span>
                </div>
                <span className={styles.leadRole}>{catalog.lead.role}</span>
                <div className={styles.leadSection}>
                  <span className={styles.leadSectionTitle}>Objetivo principal</span>
                  <ul className={styles.leadBullets}>
                    {toBullets(latest.summary).map((sentence) => (
                      <li key={sentence}>{sentence}</li>
                    ))}
                  </ul>
                </div>
                {latest.proposals.length > 0 && (
                  <div className={styles.leadSection}>
                    <span className={styles.leadSectionTitle}>Detalles en criterios de aceptación</span>
                    <ul className={styles.leadBullets}>
                      {latest.proposals.map((proposal) => (
                        <li key={proposal.criterionId}>
                          <span className={styles.criterionTag}>{proposal.criterionId}</span>{' '}
                          <strong>{PROPOSED_VERDICT_LABELS[proposal.verdict]}:</strong> {proposal.rationale}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}
          <AgentReasons steps={latest.steps} findings={latest.findings} />
          {latest.findings.length === 0 ? (
            <p className={styles.muted}>Los agentes no agregaron observaciones a las de las reglas fijas.</p>
          ) : (
            <section className={styles.findingsWrap}>
              <h3 className={styles.reasonsTitle}>Hallazgos consolidados</h3>
              <FindingsList findings={latest.findings} eventTime={eventTime} onSelectEvidence={onSelectEvidence} />
            </section>
          )}
          {status.available && recommendationField}
          <div className={styles.footer}>
            {status.available && startButton('Volver a analizar')}
            <span className={styles.usage}>
              {latest.model} · {latest.usage.inputTokens + latest.usage.cacheReadTokens + latest.usage.cacheWriteTokens}{' '}
              tokens de entrada ({latest.usage.cacheReadTokens} desde caché) · {latest.usage.outputTokens} de salida
            </span>
          </div>
        </div>
      )}
    </Panel>
  );
}
