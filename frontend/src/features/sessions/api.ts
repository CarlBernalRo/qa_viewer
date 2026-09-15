import type {
  AddMarkerInput,
  AgentRun,
  CreateSessionInput,
  FindingDecisionValue,
  SessionReview,
  SessionStats,
  SetCriterionVerdictInput,
} from '@rastro/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApi } from '../../app/providers/BackendProvider';
import { queryKeys } from '../../shared/api/queryKeys';

export function useSessions() {
  const api = useApi();
  return useQuery({ queryKey: queryKeys.sessions, queryFn: () => api.listSessions() });
}

export function useSession(id: string) {
  const api = useApi();
  return useQuery({ queryKey: queryKeys.session(id), queryFn: () => api.getSession(id) });
}

export function useSessionEvents(id: string, enabled: boolean) {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.sessionEvents(id),
    queryFn: () => api.getEvents(id),
    enabled,
    staleTime: Infinity,
  });
}

export function useSessionFindings(id: string, enabled: boolean) {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.sessionFindings(id),
    queryFn: () => api.getFindings(id),
    enabled,
    staleTime: Infinity,
  });
}

/** Si los agentes están configurados (hay clave de API) y con qué modelo. */
export function useAgentStatus() {
  const api = useApi();
  return useQuery({ queryKey: queryKeys.agentStatus, queryFn: () => api.getAgentStatus(), staleTime: 60_000 });
}

/** Corridas de los agentes, la más reciente primero. Mientras trabajan, se consulta seguido para mostrar el avance. */
export function useAgentRuns(id: string, enabled: boolean) {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.sessionAgents(id),
    queryFn: () => api.getAgentRuns(id),
    enabled,
    refetchInterval: (query) => (query.state.data?.[0]?.status === 'running' ? 2000 : false),
  });
}

/** Analizar de nuevo, o retomar un análisis fallido (`runId`) desde el agente que falta. */
export function useStartAgentRun(id: string) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (retryRunId?: string) => (retryRunId ? api.retryAgentRun(id, retryRunId) : api.startAgentRun(id)),
    onSuccess: (run) =>
      queryClient.setQueryData<AgentRun[]>(queryKeys.sessionAgents(id), (runs = []) => [
        run,
        ...runs.filter((item) => item.id !== run.id),
      ]),
  });
}

/** Veredictos por criterio y marcas del QA. */
export function useSessionReview(id: string, enabled: boolean) {
  const api = useApi();
  return useQuery({ queryKey: queryKeys.sessionReview(id), queryFn: () => api.getReview(id), enabled });
}

/** Cada cambio devuelve la revisión completa, que reemplaza a la de la caché. */
export function useReviewMutations(id: string) {
  const api = useApi();
  const queryClient = useQueryClient();
  const store = (review: SessionReview) => queryClient.setQueryData(queryKeys.sessionReview(id), review);
  return {
    addMarker: useMutation({ mutationFn: (input: AddMarkerInput) => api.addMarker(id, input), onSuccess: store }),
    removeMarker: useMutation({ mutationFn: (markerId: string) => api.removeMarker(id, markerId), onSuccess: store }),
    setVerdict: useMutation({
      mutationFn: ({ criterionId, ...input }: SetCriterionVerdictInput & { criterionId: string }) =>
        api.setCriterionVerdict(id, criterionId, input),
      onSuccess: store,
    }),
  };
}

/** Exportar el informe PDF y abrirlo (o mostrarlo en su carpeta). */
export function useSessionReport(sessionId: string) {
  const api = useApi();
  const exportReport = useMutation({ mutationFn: () => api.exportReport(sessionId) });
  const openReport = useMutation({ mutationFn: (reveal: boolean) => api.openReport(sessionId, reveal) });
  return { exportReport, openReport };
}

export function useSetFindingDecision(sessionId: string) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ findingId, decision, note }: { findingId: string; decision: FindingDecisionValue | null; note?: string }) =>
      api.setFindingDecision(sessionId, findingId, decision, note),
    onSuccess: (analysis) => queryClient.setQueryData(queryKeys.sessionFindings(sessionId), analysis),
  });
}

export interface LiveStats {
  elapsedMs: number;
  stats: SessionStats;
}

/** Contadores en vivo que empuja el backend por WebSocket (ver LiveBridge). */
export function useLiveStats(id: string) {
  return useQuery<LiveStats | null>({
    queryKey: queryKeys.liveStats(id),
    queryFn: () => null,
    enabled: false,
    initialData: null,
  });
}

export function useCreateSession() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSessionInput) => api.createSession(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.sessions }),
  });
}

export function useDeleteSession() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteSession(id),
    onSuccess: (_result, id) => {
      queryClient.removeQueries({ queryKey: queryKeys.session(id) });
      queryClient.removeQueries({ queryKey: queryKeys.sessionEvents(id) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.sessions });
    },
  });
}

export function useRecordingControls(id: string) {
  const api = useApi();
  const queryClient = useQueryClient();
  const refresh = (session: Awaited<ReturnType<typeof api.getSession>>) => {
    queryClient.setQueryData(queryKeys.session(id), session);
    void queryClient.invalidateQueries({ queryKey: queryKeys.sessions });
  };
  const start = useMutation({ mutationFn: () => api.startRecording(id), onSuccess: refresh });
  const stop = useMutation({
    mutationFn: () => api.stopRecording(id),
    onSuccess: (session) => {
      refresh(session);
      void queryClient.invalidateQueries({ queryKey: queryKeys.sessionEvents(id) });
    },
  });
  return { start, stop };
}
