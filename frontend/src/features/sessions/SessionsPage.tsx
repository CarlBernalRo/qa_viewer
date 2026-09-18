import type { SessionDto } from '@rastro/shared';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { formatBytes, formatDate, formatDuration, sessionDurationMs } from '../../shared/lib/format';
import {
  AppShell,
  Button,
  Chip,
  EmptyState,
  ErrorMessage,
  IconTrash,
  Panel,
  Select,
  Skeleton,
  SkeletonGroup,
  StatusBadge,
} from '../../shared/ui';
import { useProjects } from '../projects/api';
import { useSessions } from './api';
import { DeleteSessionDialog } from './DeleteSessionDialog';
import styles from './SessionsPage.module.css';

function SessionsSkeleton() {
  return (
    <SkeletonGroup label="Cargando sesiones…" className={styles.skeleton}>
      {Array.from({ length: 5 }, (_, index) => (
        <div key={index} className={styles.skeletonRow}>
          <div className={styles.skeletonName}>
            <Skeleton width="45%" height={14} />
            <Skeleton width="70%" height={11} />
          </div>
          <Skeleton width={70} height={14} />
          <Skeleton width={36} height={20} />
          <Skeleton width={90} height={14} />
          <Skeleton width={110} height={14} />
          <Skeleton width={60} height={14} />
          <Skeleton width={50} height={14} />
        </div>
      ))}
    </SkeletonGroup>
  );
}

export function SessionsPage() {
  const sessions = useSessions();
  const projects = useProjects();
  const navigate = useNavigate();
  const [toDelete, setToDelete] = useState<SessionDto | null>(null);
  const [projectFilter, setProjectFilter] = useState('');
  const projectName = (id: string | undefined) => projects.data?.find((project) => project.id === id)?.name;
  const filtered = useMemo(() => {
    if (!sessions.data) return sessions.data;
    if (!projectFilter) return sessions.data;
    if (projectFilter === '__none__') return sessions.data.filter((session) => !session.capture.projectId);
    return sessions.data.filter((session) => session.capture.projectId === projectFilter);
  }, [sessions.data, projectFilter]);
  const newSession = (
    <Button variant="record" onClick={() => navigate('/sessions/new')}>
      Nueva sesión
    </Button>
  );

  return (
    <AppShell breadcrumb={<span className={styles.crumb}>Sesiones</span>} actions={newSession}>
      <div className={styles.page}>
        <header className={styles.header}>
          <h1 className={styles.title}>Sesiones</h1>
          <p className={styles.lede}>Cada sesión tiene un objetivo, una grabación y su línea de tiempo.</p>
        </header>

        {projects.data && projects.data.length > 0 && (
          <div className={styles.filters}>
            <Select
              aria-label="Filtrar por proyecto"
              value={projectFilter}
              onChange={(event) => setProjectFilter(event.target.value)}
            >
              <option value="">Todos los proyectos</option>
              <option value="__none__">Sin proyecto</option>
              {projects.data.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </Select>
          </div>
        )}

        <ErrorMessage error={sessions.error} />

        <Panel padded={false}>
          {sessions.isPending ? (
            <SessionsSkeleton />
          ) : filtered && filtered.length > 0 ? (
            <div className={styles.tableScroll}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Sesión</th>
                  <th>Proyecto</th>
                  <th>Ambiente</th>
                  <th>Estado</th>
                  <th>Creada</th>
                  <th>Duración</th>
                  <th className={styles.num}>Acciones</th>
                  <th className={styles.num}>Requests</th>
                  <th className={styles.num}>Errores</th>
                  <th className={styles.num}>Tamaño</th>
                  <th aria-label="Opciones" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((session) => (
                  <tr key={session.id}>
                    <td>
                      <Link to={`/sessions/${session.id}`} className={styles.name}>
                        {session.objective.sessionName}
                      </Link>
                      <span className={styles.statement}>{session.objective.statement}</span>
                    </td>
                    <td className={styles.muted}>
                      {projectName(session.capture.projectId) ?? '—'}
                      {session.capture.appName ? ` · ${session.capture.appName}` : ''}
                    </td>
                    <td>
                      <Chip variant="solid" mono>
                        {session.capture.environment}
                      </Chip>
                    </td>
                    <td>
                      <StatusBadge status={session.status} />
                    </td>
                    <td className={styles.muted}>{formatDate(session.createdAt)}</td>
                    <td className={styles.muted}>
                      {session.startedAt ? formatDuration(sessionDurationMs(session.startedAt, session.endedAt)) : '—'}
                    </td>
                    <td className={styles.num}>{session.stats.actions}</td>
                    <td className={styles.num}>{session.stats.requests}</td>
                    <td className={styles.num} data-alert={session.stats.errors > 0 || undefined}>
                      {session.stats.errors}
                    </td>
                    <td className={styles.num}>{formatBytes(session.sizeBytes ?? 0)}</td>
                    <td className={styles.rowActions}>
                      <button
                        type="button"
                        className={styles.iconButton}
                        onClick={() => setToDelete(session)}
                        disabled={session.status === 'recording'}
                        title={session.status === 'recording' ? 'Detén la grabación para poder eliminarla' : 'Eliminar sesión'}
                        aria-label={`Eliminar ${session.objective.sessionName}`}
                      >
                        <IconTrash width={16} height={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          ) : (
            <EmptyState
              title="Todavía no hay sesiones"
              description="Define qué vas a comprobar, abre el navegador y navega como siempre. Rastro graba cada acción, request, socket y error."
              action={newSession}
            />
          )}
        </Panel>
      </div>
      <DeleteSessionDialog session={toDelete} onClose={() => setToDelete(null)} />
    </AppShell>
  );
}
