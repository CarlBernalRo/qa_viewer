import type { CreateProjectInput, UpdateProjectInput } from '@rastro/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApi } from '../../app/providers/BackendProvider';
import { queryKeys } from '../../shared/api/queryKeys';

export function useProjects() {
  const api = useApi();
  return useQuery({ queryKey: queryKeys.projects, queryFn: () => api.listProjects() });
}

export function useCreateProject() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateProjectInput) => api.createProject(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.projects }),
  });
}

export function useUpdateProject() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: UpdateProjectInput & { id: string }) => api.updateProject(id, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.projects }),
  });
}

export function useDeleteProject() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteProject(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.projects }),
  });
}
