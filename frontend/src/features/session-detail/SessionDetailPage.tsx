import { summarizeCriteria, type SessionDto, type SessionReview } from '@rastro/shared';
import { useCallback, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useApi } from '../../app/providers/BackendProvider';
import { runningInTauri } from '../../shared/config/backendConfig';
import { useCompactWindow } from '../../shared/desktop/compactWindow';
import { formatDate, formatDuration, sessionDurationMs } from '../../shared/lib/format';
import { TEST_TYPE_LABELS } from '../../shared/lib/labels';
import { usePersistentState } from '../../shared/lib/usePersistentState';
import {
  AppShell,
  Button,
  Chip,
  DropdownMenu,
  ErrorMessage,
  Field,
  IconAlert,
  IconCopy,
  IconTrash,
  Panel,
  SegmentedControl,
  Select,
  Skeleton,
  SkeletonGroup,
  StatusBadge,
} from '../../shared/ui';
import {
  useAgentRuns,
  useAgentStatus,
  useLoadScript,
  useRecordingControls,
  useSession,
  useSessionEvents,
  useSessionFindings,
  useSessionReport,
  useSessionReview,
  useSessions,
  useSetSessionBaseline,
} from '../sessions/api';
import { DeleteSessionDialog } from '../sessions/DeleteSessionDialog';
import { AgentsPanel } from './agents/AgentsPanel';
import { AnalysisLane } from './AnalysisLane';
import { CriteriaPanel } from './criteria/CriteriaPanel';
import { EventInspector } from './EventInspector';
import { FindingsPanel } from './FindingsPanel';
import { HeaderPlayer } from './HeaderPlayer';
import { NowPlaying } from './NowPlaying';
import { overlaySources, overlaysAt } from './overlay/overlays';
import { OverlayModeControl, VideoOverlay, type OverlayMode } from './overlay/VideoOverlay';
import { ProblemsPanel } from './ProblemsPanel';
import { RecordingPanel } from './RecordingPanel';
import { RecordingWidget } from './RecordingWidget';
import { ReportNotice } from './ReportNotice';
import { sessionToReport } from './sessionReport';
import styles from './SessionDetail.module.css';
import { buildTimeline, type TimelineItem, type TimelineModel } from './timeline/buildTimeline';
import {
  applyFilters,
  collectProblems,
  DEFAULT_FILTERS,
  itemsAt,
  type Problem,
  type TimelineFilters,
} from './timeline/filterTimeline';
import { Timeline } from './timeline/Timeline';
import { TimelineSearch, TimelineToolbar } from './timeline/TimelineToolbar';
import { VideoPlayer, type SeekRequest } from './VideoPlayer';

function ObjectivePanel({ session, collapsible }: { session: SessionDto; collapsible: boolean }) {
  const { objective } = session;
  return (
    <Panel
      title="Objetivo"
      subtitle={collapsible ? objective.statement : objective.linkedIssue}
      {...(collapsible ? { collapsibleKey: 'objective', defaultCollapsed: true } : {})}
    >
      <div className={styles.objective}>
        <p className={styles.statement}>{objective.statement}</p>
        {/* Al revisar, los criterios se evalúan en su propio panel. */}
        {!collapsible && (
          <ol className={styles.criteria}>
            {objective.criteria.map((criterion) => (
              <li key={criterion.id}>
                <span className="mono">{criterion.id}</span>
                <span>{criterion.text}</span>
              </li>
            ))}
          </ol>
        )}
        {(objective.scope.include.length > 0 || objective.scope.exclude.length > 0) && (
          <div className={styles.scope}>
            {objective.scope.include.map((item) => (
              <Chip key={`in-${item}`} variant="solid" mono>
                {item}
              </Chip>
            ))}
            {objective.scope.exclude.map((item) => (
              <Chip key={`out-${item}`} variant="dashed" mono>
                {item}
              </Chip>
            ))}
          </div>
        )}
        {objective.linkedIssue && <span className={styles.muted}>Historia vinculada: {objective.linkedIssue}</span>}
      </div>
    </Panel>
  );
}

function DraftPanel({ session }: { session: SessionDto }) {
  const { start } = useRecordingControls(session.id);
  return (
    <Panel title="Lista para grabar">
      <div className={styles.draft}>
        <p>
          Se abrirá Chromium a pantalla completa en <span className="mono">{session.capture.startUrl}</span>
          {runningInTauri() ? ' y Rastro se convertirá en un widget flotante con los controles.' : '.'}
        </p>
        <ErrorMessage error={start.error} />
        <div>
          <Button variant="record" size="lg" loading={start.isPending} onClick={() => start.mutate()}>
            Abrir navegador y grabar
          </Button>
        </div>
      </div>
    </Panel>
  );
}

function TimelineSkeleton() {
  return (
    <SkeletonGroup label="Cargando eventos…">
      {Array.from({ length: 6 }, (_, index) => (
        <div key={index} className={styles.timelineSkeletonRow}>
          <Skeleton width={96} height={11} />
          <Skeleton width={`${55 + ((index * 17) % 40)}%`} height={16} />
        </div>
      ))}
    </SkeletonGroup>
  );
}

/** Elige la sesión base contra la que el agente de Regresión compara esta sesión. */
function BaselinePicker({ session }: { session: SessionDto }) {
  const sessions = useSessions();
  const setBaseline = useSetSessionBaseline(session.id);
  const candidates = (sessions.data ?? []).filter((item) => item.id !== session.id && item.status === 'completed');

  return (
    <Field
      label="Sesión base para el agente de Regresión"
      optional
      info="El agente de Regresión compara esta sesión contra la que elijas acá: endpoints nuevos o que desaparecieron, cambios de status y errores de consola nuevos."
    >
      {(id) => (
        <Select
          id={id}
          value={session.baselineSessionId ?? ''}
          disabled={setBaseline.isPending}
          onChange={(event) => setBaseline.mutate(event.target.value || undefined)}
        >
          <option value="">Sin sesión base</option>
          {candidates.map((item) => (
            <option key={item.id} value={item.id}>
              {item.objective.sessionName}
            </option>
          ))}
        </Select>
      )}
    </Field>
  );
}

interface ReplayWorkspaceProps {
  session: SessionDto;
  loading: boolean;
  error: unknown;
  model: TimelineModel;
  errors: Problem[];
  warnings: Problem[];
  review: SessionReview | undefined;
  reviewLoading: boolean;
  onVideoElement: (video: HTMLVideoElement | null) => void;
}

function ReplayWorkspace({
  session,
  loading,
  error,
  model,
  errors,
  warnings,
  review,
  reviewLoading,
  onVideoElement,
}: ReplayWorkspaceProps) {
  const api = useApi();
  const findings = useSessionFindings(session.id, true);
  const agentStatus = useAgentStatus();
  const agentRuns = useAgentRuns(session.id, true);
  const latestCompletedRun = agentRuns.data?.find((run) => run.status === 'completed');
  const [lane, setLane] = useState<'deterministic' | 'ai'>('deterministic');
  const [filters, setFilters] = useState<TimelineFilters>(DEFAULT_FILTERS);
  const visibleModel = useMemo(() => applyFilters(model, filters), [model, filters]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [currentMs, setCurrentMs] = useState(0);
  const [seek, setSeek] = useState<SeekRequest | null>(null);
  const offsetMs = session.videoOffsetMs ?? 0;

  // Lo que ocurre en el momento del video que se está viendo, para resaltarlo en todas las vistas.
  const watching = currentMs > offsetMs;
  const active = useMemo(() => (watching ? itemsAt(model, currentMs) : []), [model, currentMs, watching]);
  const activeIds = useMemo(() => new Set(active.map((item) => item.id)), [active]);

  // Recuadros sobre el video: el elemento del clic y los problemas de accesibilidad de ese momento.
  const [localVideo, setLocalVideo] = useState<HTMLVideoElement | null>(null);
  const handleVideoElement = useCallback(
    (video: HTMLVideoElement | null) => {
      setLocalVideo(video);
      onVideoElement(video);
    },
    [onVideoElement],
  );
  const [overlayMode, setOverlayMode] = usePersistentState<OverlayMode>('rastro.overlayMode', 'always');
  const sources = useMemo(() => overlaySources(model.eventsById.values()), [model]);
  const overlayBoxes = useMemo(() => overlaysAt(sources, currentMs), [sources, currentMs]);

  const select = (item: TimelineItem) => {
    setSelectedId(item.eventId);
    setSeek({ ms: item.start, nonce: Date.now() });
  };
  /** Un hallazgo apunta a un eventId directo (no a un TimelineItem ya armado). */
  const selectEventId = (eventId: string) => {
    const event = model.eventsById.get(eventId);
    if (!event) return;
    setSelectedId(eventId);
    setSeek({ ms: event.t, nonce: Date.now() });
  };
  const selected = selectedId ? (model.eventsById.get(selectedId) ?? null) : null;

  return (
    <div className={styles.workspace}>
      <div className={styles.mainColumn}>
        <Panel
          title="Grabación de pantalla"
          collapsibleKey="video"
          padded={false}
          {...(session.hasVideo
            ? { actions: <OverlayModeControl value={overlayMode} onChange={setOverlayMode} /> }
            : {})}
        >
          {session.hasVideo ? (
            <>
              <div className={styles.stage}>
                <VideoPlayer
                  src={api.videoUrl(session.id)}
                  offsetMs={offsetMs}
                  seekRequest={seek}
                  onTimeChange={setCurrentMs}
                  onElement={handleVideoElement}
                >
                  <VideoOverlay
                    video={localVideo}
                    boxes={overlayBoxes}
                    mode={overlayMode}
                    selectedEventId={selectedId}
                    onSelect={setSelectedId}
                  />
                </VideoPlayer>
              </div>
              {!loading && <NowPlaying model={model} active={active} currentMs={currentMs} onSelect={select} />}
            </>
          ) : (
            <p className={`${styles.muted} ${styles.pad}`}>Esta sesión no tiene video.</p>
          )}
        </Panel>

        <CriteriaPanel
          session={session}
          review={review}
          loading={reviewLoading}
          currentMs={currentMs}
          onSeek={(ms) => setSeek({ ms, nonce: Date.now() })}
          {...(latestCompletedRun ? { proposals: latestCompletedRun.proposals } : {})}
        />

        <div className={styles.laneSwitch}>
          <SegmentedControl
            ariaLabel="Fuente del análisis"
            value={lane}
            onChange={setLane}
            options={[
              { value: 'deterministic', label: 'Análisis del proyecto' },
              { value: 'ai', label: 'Análisis de IA' },
            ]}
          />
        </div>

        {lane === 'ai' ? (
          <AnalysisLane variant="ai">
            <BaselinePicker session={session} />
            <AgentsPanel
              session={session}
              status={agentStatus.data}
              runs={agentRuns.data}
              loading={agentStatus.isPending || agentRuns.isPending}
              eventTime={(eventId) => model.eventsById.get(eventId)?.t}
              onSelectEvidence={selectEventId}
            />
          </AnalysisLane>
        ) : (
          <AnalysisLane variant="deterministic">
            {loading ? (
              <Panel title="Errores y avisos">
                <SkeletonGroup label="Cargando errores…">
                  <Skeleton height={14} width="80%" />
                  <Skeleton height={14} width="65%" />
                </SkeletonGroup>
              </Panel>
            ) : (
              <ProblemsPanel
                errors={errors}
                warnings={warnings}
                selectedId={selectedId}
                activeIds={activeIds}
                onSelect={select}
              />
            )}

            {!loading && (
              <FindingsPanel
                session={session}
                analysis={findings.data}
                loading={findings.isPending}
                error={findings.error}
                selectedEventId={selectedId}
                onSelectEvidence={selectEventId}
              />
            )}
          </AnalysisLane>
        )}

        <Panel
          title="Línea de tiempo"
          collapsibleKey="timeline"
          actions={<TimelineSearch value={filters.query} onChange={(query) => setFilters({ ...filters, query })} />}
        >
          <ErrorMessage error={error} />
          {loading ? (
            <TimelineSkeleton />
          ) : (
            <>
              <TimelineToolbar
                model={model}
                filters={filters}
                errorCount={errors.length}
                warningCount={warnings.length}
                onChange={setFilters}
              />
              <Timeline
                model={visibleModel}
                selectedId={selectedId}
                activeIds={activeIds}
                currentMs={currentMs}
                onSelect={select}
              />
            </>
          )}
        </Panel>
      </div>
      <aside className={styles.sideColumn} aria-label="Detalle del evento">
        <EventInspector event={selected} model={model} sessionId={session.id} />
      </aside>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <SkeletonGroup label="Cargando sesión…" className={styles.page}>
      <Skeleton width={320} height={28} />
      <Skeleton width={260} height={16} />
      <div className={styles.topGrid}>
        <Panel title="Objetivo">
          <SkeletonGroup label="">
            <Skeleton height={16} width="85%" />
            <Skeleton height={13} width="70%" />
            <Skeleton height={13} width="60%" />
          </SkeletonGroup>
        </Panel>
        <Panel title=" ">
          <Skeleton height={120} />
        </Panel>
      </div>
    </SkeletonGroup>
  );
}

export function SessionDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const query = useSession(id);
  const session = query.data;
  const [expanded, setExpanded] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [videoElement, setVideoElement] = useState<HTMLVideoElement | null>(null);

  // Mientras graba (en la app de escritorio), Rastro se vuelve un widget flotante.
  const compact = runningInTauri() && session?.status === 'recording' && !expanded;
  useCompactWindow(compact);

  // Los eventos se cargan aquí para que el encabezado muestre el mismo conteo que la lista de errores.
  const isReplay = session?.status === 'completed' || session?.status === 'failed';
  const events = useSessionEvents(id, isReplay);
  const model = useMemo(() => buildTimeline(events.data ?? []), [events.data]);
  const { errors, warnings } = useMemo(() => collectProblems(model), [model]);
  const report = useSessionReport(id);
  const loadScript = useLoadScript(id);
  const review = useSessionReview(id, Boolean(session && session.status !== 'draft'));
  // Mismas queries que usa ReplayWorkspace: React Query comparte la caché, no duplica el pedido.
  const findings = useSessionFindings(id, Boolean(isReplay));
  const agentRuns = useAgentRuns(id, Boolean(isReplay));

  if (compact && session) {
    return <RecordingWidget session={session} onExpand={() => setExpanded(true)} />;
  }

  const errorCount = events.data ? errors.length : (session?.stats.errors ?? 0);
  const criteriaSummary =
    session && review.data
      ? summarizeCriteria(
          session.objective.criteria.map((criterion) => criterion.id),
          review.data,
        )
      : null;
  const actions = session && (
    <>
      {isReplay && session.hasVideo && <HeaderPlayer video={videoElement} />}
      <DropdownMenu
      label="Acciones"
      items={[
        {
          label: 'Exportar informe PDF',
          disabled: !isReplay || report.exportReport.isPending,
          ...(!isReplay ? { hint: 'Disponible cuando la sesión termina de grabarse' } : {}),
          onSelect: () => report.exportReport.mutate(),
        },
        {
          label: 'Descargar script de carga (k6)',
          disabled: session.status !== 'completed' || loadScript.isPending,
          ...(session.status !== 'completed' ? { hint: 'Disponible cuando la sesión termina de grabarse' } : {}),
          onSelect: () =>
            loadScript.mutate(undefined, {
              onSuccess: ({ fileName, script }) => {
                const url = URL.createObjectURL(new Blob([script], { type: 'text/javascript' }));
                const link = document.createElement('a');
                link.href = url;
                link.download = fileName;
                link.click();
                URL.revokeObjectURL(url);
              },
            }),
        },
        {
          label: 'Copiar informe completo',
          icon: <IconCopy width={15} height={15} />,
          disabled: !review.data,
          ...(!review.data ? { hint: 'Disponible cuando la sesión termina de grabarse' } : {}),
          onSelect: () =>
            review.data &&
            void navigator.clipboard
              .writeText(sessionToReport(session, review.data, findings.data, agentRuns.data?.[0]))
              .catch(() => undefined),
        },
        {
          label: 'Copiar ID de la sesión',
          icon: <IconCopy width={15} height={15} />,
          onSelect: () => void navigator.clipboard.writeText(session.id).catch(() => undefined),
        },
        {
          label: 'Eliminar sesión',
          icon: <IconTrash width={15} height={15} />,
          danger: true,
          disabled: session.status === 'recording',
          ...(session.status === 'recording' ? { hint: 'Detén la grabación para poder eliminarla' } : {}),
          onSelect: () => setDeleting(true),
        },
      ]}
      />
    </>
  );

  return (
    <AppShell
      breadcrumb={
        <>
          <Link to="/">Sesiones</Link>
          <span>/</span>
          <span className={styles.crumbCurrent}>{session?.objective.sessionName ?? 'Sesión'}</span>
        </>
      }
      actions={actions}
    >
      {query.isPending ? (
        <DetailSkeleton />
      ) : !session ? (
        <ErrorMessage error={query.error ?? new Error('No se encontró la sesión.')} />
      ) : (
        <div className={styles.page}>
          <header className={styles.header}>
            <div className={styles.titleRow}>
              <h1 className={styles.title}>{session.objective.sessionName}</h1>
              <StatusBadge status={session.status} />
              {errorCount > 0 && isReplay && (
                <button
                  type="button"
                  className={styles.errorChip}
                  onClick={() => document.getElementById('problemas')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                >
                  <IconAlert width={14} height={14} />
                  {errorCount} {errorCount === 1 ? 'error' : 'errores'} · ver cuáles
                </button>
              )}
              {isReplay && criteriaSummary && (
                <span
                  className={styles.criteriaChip}
                  data-tone={
                    criteriaSummary.fail > 0
                      ? 'fail'
                      : criteriaSummary.pass === session.objective.criteria.length
                        ? 'pass'
                        : 'neutral'
                  }
                >
                  Criterios: {criteriaSummary.pass}/{session.objective.criteria.length} cumplen
                </span>
              )}
            </div>
            <div className={styles.meta}>
              <Chip variant="solid" mono>
                {session.capture.environment}
              </Chip>
              <span>{TEST_TYPE_LABELS[session.objective.testType]}</span>
              <span>Creada {formatDate(session.createdAt)}</span>
              {session.endedAt && <span>Duró {formatDuration(sessionDurationMs(session.startedAt, session.endedAt))}</span>}
            </div>
          </header>

          <ReportNotice report={report} />

          {session.status === 'failed' && session.failureReason && (
            <ErrorMessage error={new Error(session.failureReason)} />
          )}

          {isReplay ? (
            <ObjectivePanel session={session} collapsible />
          ) : (
            <div className={styles.topGrid}>
              <ObjectivePanel session={session} collapsible={false} />
              {session.status === 'draft' && <DraftPanel session={session} />}
              {session.status === 'recording' && <RecordingPanel session={session} onCompact={() => setExpanded(false)} />}
            </div>
          )}

          {isReplay && (
            <ReplayWorkspace
              session={session}
              loading={events.isPending}
              error={events.error}
              model={model}
              errors={errors}
              warnings={warnings}
              review={review.data}
              reviewLoading={review.isPending}
              onVideoElement={setVideoElement}
            />
          )}
        </div>
      )}
      <DeleteSessionDialog
        session={deleting && session ? session : null}
        onClose={() => setDeleting(false)}
        onDeleted={() => navigate('/')}
      />
    </AppShell>
  );
}
