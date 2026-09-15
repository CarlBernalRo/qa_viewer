import {
  AGENT_CATALOG,
  AGENT_ORDER,
  FINDING_SEVERITY_LABELS,
  type AgentFinding,
  type AgentRun,
  type AgentStatus,
  type AgentStep,
  type SessionDto,
} from '@rastro/shared';
import { cx } from '../../../shared/lib/cx';
import { formatClock } from '../../../shared/lib/format';
import { ErrorMessage, InfoTip, Panel } from '../../../shared/ui';
import { useStartAgentRun } from '../../sessions/api';
import { AgentAvatar } from './AgentAvatar';
import styles from './AgentsPanel.module.css';

const STEP_LABELS: Record<AgentStep['status'], string> = {
  pending: 'En espera',
  running: 'Analizando…',
  done: 'Listo',
  failed: 'Falló',
};

function Team() {
  return (
    <ul className={styles.team}>
      {AGENT_ORDER.map((agent) => (
        <li key={agent} className={styles.member}>
          <AgentAvatar agent={agent} size={32} />
          <span className={styles.memberText}>
            <strong>{AGENT_CATALOG[agent].name}</strong>
            <span>{AGENT_CATALOG[agent].role}</span>
            <span className={styles.reads}>Lee: {AGENT_CATALOG[agent].reads}</span>
          </span>
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

function Steps({ run }: { run: AgentRun }) {
  return (
    <ol className={styles.steps}>
      {run.steps.map((step) => (
        <li key={step.agentId} className={cx(styles.step, styles[`step_${step.status}`])}>
          <AgentAvatar agent={step.agentId} size={28} busy={step.status === 'running'} />
          <span className={styles.stepText}>
            <span className={styles.stepHead}>
              <strong>{AGENT_CATALOG[step.agentId].name}</strong>
              <span className={styles.stepStatus}>{STEP_LABELS[step.status]}</span>
            </span>
            {step.summary && <span className={styles.stepSummary}>{step.summary}</span>}
            {step.error && <span className={styles.stepError}>{step.error}</span>}
          </span>
        </li>
      ))}
    </ol>
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
  return (
    <li className={styles.finding}>
      <div className={styles.findingHead}>
        <span className={cx(styles.severity, styles[finding.severity])}>{FINDING_SEVERITY_LABELS[finding.severity]}</span>
        <strong className={styles.findingTitle}>{finding.title}</strong>
        <span className={styles.findingAgents} title="Agentes que lo respaldan">
          {finding.agents.map((agent) => (
            <AgentAvatar key={agent} agent={agent} size={20} />
          ))}
        </span>
      </div>
      <p className={styles.findingDetail}>{finding.detail}</p>
      {finding.recommendation && <p className={styles.findingRecommendation}>💡 {finding.recommendation}</p>}
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
    </li>
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
  const start = useStartAgentRun(session.id);
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

  const startButton = (label: string) => (
    <button type="button" className={styles.start} disabled={running} onClick={() => start.mutate(undefined)}>
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
          Tres agentes de IA revisan la sesión grabada: dos especialistas (API REST y Front-end) y un QA Lead que junta lo
          que encuentran y propone un veredicto por criterio. Tú decides: nada cambia hasta que aceptas una propuesta.
        </InfoTip>
      }
    >
      <ErrorMessage error={start.error} />
      {loading || !status ? (
        <p className={styles.muted}>Cargando…</p>
      ) : !latest ? (
        <div className={styles.stack}>
          {!status.available && <NotConfigured />}
          <Team />
          {status.available && (
            <>
              <p className={styles.consent}>
                Al analizar se envía a {status.provider} un resumen de esta sesión con los datos sensibles ya ocultos: objetivo,
                criterios, tus marcas y veredictos, las llamadas a la API, la consola, la accesibilidad y el rendimiento.
                No se envía el video. Modelo: <span className="mono">{status.model}</span>.
              </p>
              <div>{startButton('Analizar con agentes')}</div>
            </>
          )}
        </div>
      ) : latest.status !== 'completed' ? (
        <div className={styles.stack}>
          <Steps run={latest} />
          {latest.status === 'failed' && (
            <>
              <ErrorMessage error={new Error(latest.error ?? 'El análisis no terminó.')} />
              {status.available ? (
                <div className={styles.retryRow}>
                  <button type="button" className={styles.start} disabled={running} onClick={() => start.mutate(latest.id)}>
                    {running
                      ? 'Retomando…'
                      : `Reintentar${pendingAgent ? ` desde ${AGENT_CATALOG[pendingAgent].name}` : ''}`}
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
            <div className={styles.summary}>
              <AgentAvatar agent="lead" size={32} />
              <p>{latest.summary}</p>
            </div>
          )}
          {latest.findings.length === 0 ? (
            <p className={styles.muted}>Los agentes no agregaron observaciones a las de las reglas fijas.</p>
          ) : (
            <ul className={styles.findings}>
              {latest.findings.map((finding) => (
                <FindingItem key={finding.id} finding={finding} eventTime={eventTime} onSelectEvidence={onSelectEvidence} />
              ))}
            </ul>
          )}
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
