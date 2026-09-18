import type { AgentId, AgentSettings } from '@rastro/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApi } from '../../app/providers/BackendProvider';
import { queryKeys } from '../../shared/api/queryKeys';

export function useAgentSettings() {
  const api = useApi();
  return useQuery({ queryKey: queryKeys.agentSettings, queryFn: () => api.getAgentSettings(), staleTime: 60_000 });
}

export function useUpdateAgentSettings() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...settings }: AgentSettings & { id: AgentId }) => api.updateAgentSettings(id, settings),
    onSuccess: (settings, { id }) =>
      queryClient.setQueryData<Partial<Record<AgentId, AgentSettings>>>(queryKeys.agentSettings, (all = {}) => ({
        ...all,
        [id]: settings,
      })),
  });
}
