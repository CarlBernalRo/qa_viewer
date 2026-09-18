import { agentIdSchema, API_ROUTES, updateAgentSettingsInputSchema } from '@rastro/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { UseCases } from '../../../application/index.js';
import { parseOrThrow } from '../errors.js';

const idParams = z.object({ id: agentIdSchema });

export async function agentSettingsRoutes(app: FastifyInstance, useCases: UseCases): Promise<void> {
  app.get(API_ROUTES.agentSettings, async () => useCases.getAgentSettings.execute());

  app.put('/api/agent-settings/:id', async (request) => {
    const { id } = parseOrThrow(idParams, request.params);
    const input = parseOrThrow(updateAgentSettingsInputSchema, request.body);
    return useCases.updateAgentSettings.execute(id, input);
  });
}
