import { z } from 'zod';

/** Agrupa sesiones bajo un cliente/empresa (p. ej. "Empresa A"), con sus apps (p. ej. SIS, LMS, CRM). */
export const projectSchema = z.object({
  id: z.string(),
  name: z.string().trim().min(1).max(120),
  apps: z.array(z.string().trim().min(1).max(60)).max(30),
  createdAt: z.iso.datetime(),
});
export type ProjectDto = z.infer<typeof projectSchema>;

export const createProjectInputSchema = z.object({
  name: projectSchema.shape.name,
});
export type CreateProjectInput = z.infer<typeof createProjectInputSchema>;

export const updateProjectInputSchema = z.object({
  name: projectSchema.shape.name.optional(),
  apps: projectSchema.shape.apps.optional(),
});
export type UpdateProjectInput = z.infer<typeof updateProjectInputSchema>;

export const projectListSchema = z.object({ projects: z.array(projectSchema) });
