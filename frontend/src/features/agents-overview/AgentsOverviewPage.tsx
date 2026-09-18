import { AGENT_ROSTER_ORDER, type AgentRosterId, type AgentRosterMeta, type AgentRun, type SessionDto } from '@rastro/shared';
import { useQueries } from '@tanstack/react-query';
import { useMemo } from 'react';
import { Link } from 'react-router';
import { useApi } from '../../app/providers/BackendProvider';
import { formatDate } from '../../shared/lib/format';
import { cx } from '../../shared/lib/cx';
import { queryKeys } from '../../shared/api/queryKeys';
import { AppShell, EmptyState, ErrorMessage, InfoTip, Panel, Skeleton, SkeletonGroup } from '../../shared/ui';
import { RosterAvatar } from '../session-detail/agents/RosterAvatar';
import { useAgentStatus, useSessions } from '../sessions/api';
import { useAgentCatalog } from './AgentCatalogContext';
import styles from './AgentsOverviewPage.module.css';

const RUN_STATUS_LABELS: Record<AgentRun['status'], string> = {
  running: 'Analizando…',
  completed: 'Terminado',
  failed: 'Falló',
};

interface Row {
  session: SessionDto;
  run: AgentRun | undefined;
}

function RosterCard({ id, index, meta }: { id: AgentRosterId; index: number; meta: AgentRosterMeta }) {
  return (
    <Link to={`/agentes/${id}`} className={cx(styles.rosterCard, !meta.implemented && styles.rosterCardSoon)}>
      <div className={styles.rosterHead}>
        <RosterAvatar
          agent={id}
          color={meta.color}
          name={meta.name}
          eyeShape={meta.eyeShape}
          animation={meta.animation}
          gesture={meta.gesture}
          animate={meta.implemented}
          delayMs={index * 220}
          size={30}
        />
        <strong className={styles.rosterName}>{meta.name}</strong>
        <span className={cx(styles.rosterBadge, meta.implemented ? styles.rosterBadgeOn : styles.rosterBadgeSoon)}>
          {meta.capability === 'generator' ? 'Disponible' : meta.implemented ? 'En el equipo' : 'Próximamente'}
        </span>
      </div>
      <p className={styles.rosterRole}>{meta.role}</p>
      <p className={styles.rosterReads}>Lee: {meta.reads}</p>
    </Link>
  );
}

export function AgentsOverviewPage() {
  const api = useApi();
  const { roster } = useAgentCatalog();
  const status = useAgentStatus();
  const sessions = useSessions();
  const completed = useMemo(() => (sessions.data ?? []).filter((session) => session.status === 'completed'), [sessions.data]);

  const runs = useQueries({
    queries: completed.map((session) => ({
      queryKey: queryKeys.sessionAgents(session.id),
      queryFn: () => api.getAgentRuns(session.id),
    })),
  });

  const loading = sessions.isPending || status.isPending || (completed.length > 0 && runs.some((query) => query.isPending));
  const firstError = sessions.error ?? status.error ?? runs.find((query) => query.error)?.error;

  const rows: Row[] = completed.map((session, index) => ({
    session,
    run: (runs[index]?.data as AgentRun[] | undefined)?.[0],
  }));
  const analyzed = rows.filter((row) => row.run);

  return (
    <AppShell breadcrumb={<span className={styles.crumb}>Agentes</span>}>
      <div className={styles.page}>
        <header className={styles.header}>
          <h1 className={styles.title}>Equipo de agentes</h1>
          <p className={styles.lede}>
            El equipo completo de la visión de producto: 10 especialistas y el QA Lead ya corren de verdad, más Carga y
            Reportero como generadores determinísticos (sin IA) desde el menú Acciones de la sesión.
          </p>
        </header>

        <ErrorMessage error={firstError} />

        {!status.isPending && status.data && (
          <div className={cx(styles.statusBanner, status.data.available ? styles.statusOn : styles.statusOff)}>
            {status.data.available
              ? `Configurados: ${status.data.provider} · ${status.data.model}`
              : status.data.reason ?? 'Los agentes no están configurados.'}
          </div>
        )}

        <Panel
          title="Especialistas"
          subtitle="Sin agentes configurados no corre ninguno; con agentes, el modo Sugeridos siempre usa el equipo completo."
          actions={
            <InfoTip label="Qué le falta al equipo">
              UI/UX y Regresión ya funcionan de verdad. UI/UX recibe una captura por cada pantalla distinta (canal
              "Capturas de pantalla" al grabar); Regresión necesita que elijas una sesión base desde el detalle de la
              sesión, si no, lo dice explícitamente y no opina.
            </InfoTip>
          }
        >
          <div className={styles.rosterGrid}>
            {AGENT_ROSTER_ORDER.map((id, index) => (
              <RosterCard key={id} id={id} index={index} meta={roster[id]} />
            ))}
          </div>
        </Panel>

        <Panel title="Corridas por sesión" padded={false}>
          {loading ? (
            <SkeletonGroup label="Cargando corridas de agentes…" className={styles.skeleton}>
              {Array.from({ length: 4 }, (_, index) => (
                <div key={index} className={styles.skeletonRow}>
                  <Skeleton width="40%" height={14} />
                  <Skeleton width={90} height={18} />
                  <Skeleton width={120} height={12} />
                </div>
              ))}
            </SkeletonGroup>
          ) : completed.length === 0 ? (
            <EmptyState
              title="Todavía no hay sesiones grabadas"
              description="Graba y termina una sesión para poder analizarla con agentes."
            />
          ) : analyzed.length === 0 ? (
            <EmptyState
              title="Ninguna sesión fue analizada con agentes todavía"
              description="Abre una sesión grabada y usa 'Analizar con agentes' en su panel Agentes."
            />
          ) : (
            <ul className={styles.list}>
              {analyzed.map(({ session, run }) => (
                <li key={session.id} className={styles.row}>
                  <Link to={`/sessions/${session.id}`} className={styles.rowLink} title="Abrir en el detalle de la sesión">
                    <span className={styles.rowMain}>
                      <span className={styles.rowTitle}>{session.objective.sessionName}</span>
                      <span className={styles.rowDetail}>{run!.summary ?? 'Sin resumen todavía.'}</span>
                    </span>
                    <span className={cx(styles.runStatus, styles[`status_${run!.status}`])}>
                      {RUN_STATUS_LABELS[run!.status]}
                    </span>
                    <span className={styles.rowMeta}>
                      {run!.findings.length} hallazgos · {formatDate(run!.startedAt)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </AppShell>
  );
}
