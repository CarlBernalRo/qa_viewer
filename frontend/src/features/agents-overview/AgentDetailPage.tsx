import { AGENT_ROSTER, type AgentId, type AgentRosterId, type AgentRun, type SessionDto } from '@rastro/shared';
import { useQueries } from '@tanstack/react-query';
import { useMemo } from 'react';
import { Link, useParams } from 'react-router';
import { useApi } from '../../app/providers/BackendProvider';
import { formatDate } from '../../shared/lib/format';
import { cx } from '../../shared/lib/cx';
import { queryKeys } from '../../shared/api/queryKeys';
import { AppShell, EmptyState, ErrorMessage, Panel, Skeleton, SkeletonGroup } from '../../shared/ui';
import { RosterAvatar } from '../session-detail/agents/RosterAvatar';
import { useSessions } from '../sessions/api';
import styles from './AgentDetailPage.module.css';

const STEP_LABELS: Record<string, string> = {
  pending: 'En espera',
  running: 'Analizando…',
  done: 'Listo',
  failed: 'Falló',
};

interface Appearance {
  session: SessionDto;
  run: AgentRun;
  stepStatus: string;
  findingsCount: number;
}

export function AgentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const api = useApi();
  const sessions = useSessions();

  const rosterId = id as AgentRosterId | undefined;
  const meta = rosterId && rosterId in AGENT_ROSTER ? AGENT_ROSTER[rosterId] : undefined;
  // Solo los especialistas de IA coinciden con AgentId: son los únicos con corridas reales que rastrear.
  const agentId = meta?.capability === 'analysis' ? (rosterId as AgentId) : null;

  const completed = useMemo(() => (sessions.data ?? []).filter((session) => session.status === 'completed'), [sessions.data]);
  const runs = useQueries({
    queries: completed.map((session) => ({
      queryKey: queryKeys.sessionAgents(session.id),
      queryFn: () => api.getAgentRuns(session.id),
      enabled: Boolean(agentId),
    })),
  });

  const loading = Boolean(agentId) && (sessions.isPending || (completed.length > 0 && runs.some((query) => query.isPending)));
  const firstError = sessions.error ?? runs.find((query) => query.error)?.error;

  const appearances: Appearance[] = useMemo(() => {
    if (!agentId) return [];
    const list: Appearance[] = [];
    completed.forEach((session, index) => {
      const sessionRuns = (runs[index]?.data as AgentRun[] | undefined) ?? [];
      const [run] = sessionRuns; // la más reciente
      if (!run) return;
      const step = run.steps.find((item) => item.agentId === agentId);
      if (!step) return;
      const findingsCount = run.findings.filter((finding) => finding.agents.includes(agentId)).length;
      list.push({ session, run, stepStatus: step.status, findingsCount });
    });
    return list;
  }, [agentId, completed, runs]);

  const totalFindings = appearances.reduce((sum, item) => sum + item.findingsCount, 0);
  const doneCount = appearances.filter((item) => item.stepStatus === 'done').length;

  if (!meta) {
    return (
      <AppShell breadcrumb={<span className={styles.crumb}>Agentes</span>}>
        <div className={styles.page}>
          <EmptyState title="Agente no encontrado" description="Volvé al equipo de agentes." action={<Link to="/agentes">← Equipo de agentes</Link>} />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
      breadcrumb={
        <>
          <Link to="/agentes">Agentes</Link>
          <span>/</span>
          <span className={styles.crumbCurrent}>{meta.name}</span>
        </>
      }
    >
      <div className={styles.page}>
        <header className={styles.header}>
          <RosterAvatar
            color={meta.color}
            name={meta.name}
            eyeShape={meta.eyeShape}
            animation={meta.animation}
            gesture={meta.gesture}
            size={48}
            animate={meta.implemented}
          />
          <div>
            <h1 className={styles.title}>{meta.name}</h1>
            <span className={cx(styles.badge, meta.implemented ? styles.badgeOn : styles.badgeSoon)}>
              {meta.capability === 'generator' ? 'Disponible' : meta.implemented ? 'En el equipo' : 'Próximamente'}
            </span>
          </div>
        </header>

        <Panel title="Qué hace">
          <p className={styles.role}>{meta.role}</p>
          <p className={styles.reads}>Lee: {meta.reads}</p>
        </Panel>

        <Panel title="Configuración">
          {meta.capability === 'analysis' ? (
            <div className={styles.configBox}>
              <p>
                Corre en modo "Sugeridos" (arranca solo al terminar de grabar) y en "Analizar con agentes" a mano desde
                una sesión ya grabada, junto al resto del equipo fijo.
              </p>
              <p className={styles.configNote}>
                {rosterId === 'lead'
                  ? 'Siempre corre: junta lo que encuentran los demás, así que no se puede dejar afuera en "Elegir yo".'
                  : 'En modo "Elegir yo" el QA puede incluirlo o dejarlo afuera de la corrida, sesión por sesión, desde el paso de captura al crear la sesión.'}
              </p>
            </div>
          ) : meta.capability === 'generator' ? (
            <div className={styles.configBox}>
              <p>No usa IA: arma su salida con lo que ya se grabó, siempre igual para los mismos datos.</p>
              <p className={styles.configNote}>
                Se dispara a mano desde el menú "Acciones" de una sesión ya grabada, no desde "Sugeridos" ni "Elegir yo".
              </p>
            </div>
          ) : (
            <div className={styles.configBox}>
              <p>
                Este agente está en el catálogo de la visión de producto (<span className="mono">rastro-vision.html</span>)
                pero todavía no tiene prompt, esquema de salida ni lógica de ejecución propia: no hay nada que
                configurar todavía.
              </p>
            </div>
          )}
        </Panel>

        {meta.capability === 'analysis' && (
          <Panel
            title="Actividad"
            subtitle={
              appearances.length > 0
                ? `${doneCount}/${appearances.length} corridas terminadas · ${totalFindings} hallazgos en total`
                : undefined
            }
            padded={false}
          >
            <ErrorMessage error={firstError} />
            {loading ? (
              <SkeletonGroup label="Cargando actividad del agente…" className={styles.skeleton}>
                {Array.from({ length: 3 }, (_, index) => (
                  <div key={index} className={styles.skeletonRow}>
                    <Skeleton width="50%" height={14} />
                    <Skeleton width={80} height={14} />
                  </div>
                ))}
              </SkeletonGroup>
            ) : appearances.length === 0 ? (
              <EmptyState
                title="Todavía no participó en ningún análisis"
                description="Aparece acá la primera vez que se analice una sesión con agentes."
              />
            ) : (
              <ul className={styles.list}>
                {appearances.map(({ session, stepStatus, findingsCount }) => (
                  <li key={session.id} className={styles.row}>
                    <Link to={`/sessions/${session.id}`} className={styles.rowLink} title="Abrir en el detalle de la sesión">
                      <span className={styles.rowTitle}>{session.objective.sessionName}</span>
                      <span className={cx(styles.stepStatus, styles[`status_${stepStatus}`])}>
                        {STEP_LABELS[stepStatus] ?? stepStatus}
                      </span>
                      <span className={styles.rowMeta}>
                        {findingsCount} hallazgos · {formatDate(session.createdAt)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        )}
      </div>
    </AppShell>
  );
}
