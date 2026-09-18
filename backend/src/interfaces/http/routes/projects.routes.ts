import { API_ROUTES, createProjectInputSchema, updateProjectInputSchema } from '@rastro/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { UseCases } from '../../../application/index.js';
import { parseOrThrow } from '../errors.js';

const idParams = z.object({ id: z.string().min(1).max(80) });

export async function projectRoutes(app: FastifyInstance, useCases: UseCases): Promise<void> {
  app.get(API_ROUTES.projects, async () => ({ projects: await useCases.listProjects.execute() }));

  app.post(API_ROUTES.projects, async (request, reply) => {
    const input = parseOrThrow(createProjectInputSchema, request.body);
    const project = await useCases.createProject.execute(input);
    return reply.status(201).send(project);
  });

  app.patch('/api/projects/:id', async (request) => {
    const { id } = parseOrThrow(idParams, request.params);
    const input = parseOrThrow(updateProjectInputSchema, request.body);
    return useCases.updateProject.execute(id, input);
  });

  app.delete('/api/projects/:id', async (request, reply) => {
    const { id } = parseOrThrow(idParams, request.params);
    await useCases.deleteProject.execute(id);
    return reply.status(204).send();
  });
}
