import type { SessionDto } from '@rastro/shared';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { formatDate, formatDuration, sessionDurationMs } from '../../shared/lib/format';
import {
  AppShell,
  Button,
  Chip,
  EmptyState,
  ErrorMessage,
  IconTrash,
  Panel,
  Skeleton,
  SkeletonGroup,
  StatusBadge,
} from '../../shared/ui';
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
          <Skeleton width={36} height={20} />
          <Skeleton width={90} height={14} />
          <Skeleton width={110} height={14} />
          <Skeleton width={60} height={14} />
        </div>
      ))}
    </SkeletonGroup>
  );
}

export function SessionsPage() {
  const sessions = useSessions();
  const navigate = useNavigate();
  const [toDelete, setToDelete] = useState<SessionDto | null>(null);
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

        <ErrorMessage error={sessions.error} />

        <Panel padded={false}>
          {sessions.isPending ? (
            <SessionsSkeleton />
          ) : sessions.data && sessions.data.length > 0 ? (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Sesión</th>
                  <th>Ambiente</th>
                  <th>Estado</th>
                  <th>Creada</th>
                  <th>Duración</th>
                  <th className={styles.num}>Acciones</th>
                  <th className={styles.num}>Requests</th>
                  <th className={styles.num}>Errores</th>
                  <th aria-label="Opciones" />
                </tr>
              </thead>
              <tbody>
                {sessions.data.map((session) => (
                  <tr key={session.id}>
                    <td>
                      <Link to={`/sessions/${session.id}`} className={styles.name}>
                        {session.objective.sessionName}
                      </Link>
                      <span className={styles.statement}>{session.objective.statement}</span>
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
