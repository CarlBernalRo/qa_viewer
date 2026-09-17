import type { Finding, FindingSeverity, SessionAnalysis, SessionDto } from '@rastro/shared';
import { useQueries } from '@tanstack/react-query';
import { useMemo } from 'react';
import { Link } from 'react-router';
import { useApi } from '../../app/providers/BackendProvider';
import { formatClock, formatDate } from '../../shared/lib/format';
import { FINDING_SEVERITY_LABELS } from '../../shared/lib/labels';
import { cx } from '../../shared/lib/cx';
import { queryKeys } from '../../shared/api/queryKeys';
import { AppShell, EmptyState, ErrorMessage, Panel, Skeleton, SkeletonGroup } from '../../shared/ui';
import { useSessions } from '../sessions/api';
import styles from './FindingsOverviewPage.module.css';

const SEVERITY_ORDER: readonly FindingSeverity[] = ['critical', 'high', 'medium', 'low'];

interface Row {
  session: SessionDto;
  finding: Finding;
}

export function FindingsOverviewPage() {
  const api = useApi();
  const sessions = useSessions();
  // Los hallazgos son deterministas y no se guardan: se recalculan por sesión, como en el detalle.
  const completed = useMemo(() => (sessions.data ?? []).filter((session) => session.status === 'completed'), [sessions.data]);

  const analyses = useQueries({
    queries: completed.map((session) => ({
      queryKey: queryKeys.sessionFindings(session.id),
      queryFn: () => api.getFindings(session.id),
      staleTime: Infinity,
    })),
  });

  const loading = sessions.isPending || (completed.length > 0 && analyses.some((query) => query.isPending));
  const firstError = sessions.error ?? analyses.find((query) => query.error)?.error;

  const rows = useMemo(() => {
    const list: Row[] = [];
    completed.forEach((session, index) => {
      const analysis = analyses[index]?.data as SessionAnalysis | undefined;
      for (const finding of analysis?.findings ?? []) {
        if (finding.decision?.decision === 'dismissed') continue;
        list.push({ session, finding });
      }
    });
    return list.sort((a, b) => SEVERITY_ORDER.indexOf(a.finding.severity) - SEVERITY_ORDER.indexOf(b.finding.severity));
  }, [completed, analyses]);

  const counts = useMemo(() => {
    const byWeight = new Map<FindingSeverity, number>();
    for (const row of rows) byWeight.set(row.finding.severity, (byWeight.get(row.finding.severity) ?? 0) + 1);
    return byWeight;
  }, [rows]);

  return (
    <AppShell breadcrumb={<span className={styles.crumb}>Hallazgos</span>}>
      <div className={styles.page}>
        <header className={styles.header}>
          <h1 className={styles.title}>Hallazgos</h1>
          <p className={styles.lede}>Reglas fijas (sin IA) sobre todas las sesiones grabadas, no descartados.</p>
        </header>

        <ErrorMessage error={firstError} />

        <Panel padded={false}>
          {loading ? (
            <SkeletonGroup label="Evaluando sesiones…" className={styles.skeleton}>
              {Array.from({ length: 4 }, (_, index) => (
                <div key={index} className={styles.skeletonRow}>
                  <Skeleton width={70} height={18} />
                  <Skeleton width="60%" height={14} />
                  <Skeleton width={120} height={12} />
                </div>
              ))}
            </SkeletonGroup>
          ) : rows.length === 0 ? (
            <EmptyState
              title={completed.length === 0 ? 'Todavía no hay sesiones grabadas' : 'Sin hallazgos pendientes'}
              description={
                completed.length === 0
                  ? 'Graba y termina una sesión para que las reglas fijas la evalúen.'
                  : 'Las reglas fijas no encontraron nada sin descartar en las sesiones grabadas.'
              }
            />
          ) : (
            <>
              <div className={styles.summary}>
                {SEVERITY_ORDER.filter((severity) => counts.has(severity)).map((severity) => (
                  <span key={severity} className={cx(styles.summaryTag, styles[severity])}>
                    {counts.get(severity)} {FINDING_SEVERITY_LABELS[severity].toLowerCase()}
                  </span>
                ))}
              </div>
              <ul className={styles.list}>
                {rows.map(({ session, finding }) => (
                  <li key={`${session.id}-${finding.id}`} className={styles.row}>
                    <Link
                      to={`/sessions/${session.id}`}
                      className={styles.rowLink}
                      title="Abrir en el detalle de la sesión"
                    >
                      <span className={cx(styles.severity, styles[finding.severity])}>
                        {FINDING_SEVERITY_LABELS[finding.severity]}
                      </span>
                      <span className={styles.rowMain}>
                        <span className={styles.rowTitle}>
                          {finding.title}
                          {finding.occurrences > 1 && <span className={styles.occurrences}>×{finding.occurrences}</span>}
                        </span>
                        <span className={styles.rowDetail}>{finding.detail}</span>
                        <span className={styles.rowSession}>
                          {session.objective.sessionName} · {formatDate(session.createdAt)}
                        </span>
                      </span>
                      <span className={styles.rowTime}>{formatClock(finding.firstAt)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Panel>
      </div>
    </AppShell>
  );
}
