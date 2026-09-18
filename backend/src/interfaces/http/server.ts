import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import { API_ROUTES, type Health } from '@rastro/shared';
import Fastify, { LogController, type FastifyBaseLogger, type FastifyInstance } from 'fastify';
import type { RecordingRegistry, UseCases } from '../../application/index.js';
import type { LiveHub } from '../live/LiveHub.js';
import { errorHandler } from './errors.js';
import { agentSettingsRoutes } from './routes/agent-settings.routes.js';
import { projectRoutes } from './routes/projects.routes.js';
import { sessionRoutes } from './routes/sessions.routes.js';
import { settingsRoutes } from './routes/settings.routes.js';
import { createSecurityHook } from './security.js';

export interface ServerDeps {
  useCases: UseCases;
  registry: RecordingRegistry;
  liveHub: LiveHub;
  logger: FastifyBaseLogger;
  authToken: string;
  allowedOrigins: readonly string[];
  version: string;
}

export async function buildServer(deps: ServerDeps): Promise<FastifyInstance> {
  const app = Fastify({
    loggerInstance: deps.logger,
    bodyLimit: 1024 * 1024,
    // Sin log por request: el frontend consulta /health seguido y llenaría el log.
    logController: new LogController({ disableRequestLogging: true }),
  });

  await app.register(cors, {
    origin: (origin, callback) => callback(null, !origin || deps.allowedOrigins.includes(origin)),
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'Range'],
  });
  await app.register(websocket);

  app.setErrorHandler(errorHandler);
  app.addHook(
    'onRequest',
    createSecurityHook({
      authToken: deps.authToken,
      allowedOrigins: deps.allowedOrigins,
      publicPaths: [API_ROUTES.health],
      queryTokenPaths: [/^\/api\/sessions\/[^/]+\/video$/, /^\/api\/sessions\/[^/]+\/screenshots\/[^/]+$/, /^\/api\/live$/],
    }),
  );

  app.get(API_ROUTES.health, async (): Promise<Health> => ({
    status: 'ok',
    version: deps.version,
    activeRecordings: deps.registry.size,
  }));

  app.get(API_ROUTES.live, { websocket: true }, (socket) => {
    deps.liveHub.add(socket);
  });

  await sessionRoutes(app, deps.useCases);
  await projectRoutes(app, deps.useCases);
  await agentSettingsRoutes(app, deps.useCases);
  await settingsRoutes(app, deps.useCases);
  return app;
}
