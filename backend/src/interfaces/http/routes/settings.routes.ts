import { agentProviderSchema, API_ROUTES, updateAppSettingsInputSchema } from '@rastro/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { UseCases } from '../../../application/index.js';
import { parseOrThrow } from '../errors.js';

const modelsQuery = z.object({ provider: agentProviderSchema.exclude(['auto']) });

export async function settingsRoutes(app: FastifyInstance, useCases: UseCases): Promise<void> {
  app.get(API_ROUTES.settings, async () => useCases.getAppSettings.execute());

  app.put(API_ROUTES.settings, async (request, reply) => {
    const input = parseOrThrow(updateAppSettingsInputSchema, request.body ?? {});
    await useCases.updateAppSettings.execute(input);
    return reply.status(204).send();
  });

  app.get('/api/settings/models', async (request) => {
    const { provider } = parseOrThrow(modelsQuery, request.query);
    return { models: await useCases.listProviderModels.execute(provider) };
  });
}
