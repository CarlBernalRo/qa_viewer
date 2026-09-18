import type { RealAgentProviderId, UpdateAppSettingsInput } from '@rastro/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApi } from '../../app/providers/BackendProvider';

export function useAppSettings() {
  const api = useApi();
  return useQuery({
    queryKey: ['settings'],
    queryFn: () => api.getAppSettings(),
  });
}

export function useUpdateAppSettings() {
  const api = useApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpdateAppSettingsInput) => api.updateAppSettings(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
  });
}

/** Modelos que ofrece un proveedor (para el selector de Ajustes). Se pide a mano, no en cada tecla. */
export function useProviderModels(provider: RealAgentProviderId | null) {
  const api = useApi();
  return useQuery({
    queryKey: ['settings', 'models', provider],
    queryFn: () => api.getProviderModels(provider as RealAgentProviderId),
    enabled: provider !== null,
    retry: false,
    staleTime: 5 * 60_000,
  });
}
