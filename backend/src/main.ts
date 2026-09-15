import { createUseCases, RecordingRegistry } from './application/index.js';
import {
  ConfigError,
  geminiApiKey,
  loadDotEnv,
  openRouterApiKey,
  parseConfig,
  type AppConfig,
} from './infrastructure/config/env.js';
import { createPinoLogger, PinoLoggerAdapter } from './infrastructure/logging/logger.js';
import type { AgentModel } from './domain/ports.js';
import { GeminiAgentModel } from './infrastructure/agents/GeminiAgentModel.js';
import { OpenRouterAgentModel } from './infrastructure/agents/OpenRouterAgentModel.js';
import { FileAgentRunStore } from './infrastructure/persistence/FileAgentRunStore.js';
import { FileEventStore } from './infrastructure/persistence/FileEventStore.js';
import { FileFindingDecisionStore } from './infrastructure/persistence/FileFindingDecisionStore.js';
import { FileMediaStore } from './infrastructure/persistence/FileMediaStore.js';
import { FileSessionReviewStore } from './infrastructure/persistence/FileSessionReviewStore.js';
import { FileSessionRepository } from './infrastructure/persistence/FileSessionRepository.js';
import { SessionPaths } from './infrastructure/persistence/SessionPaths.js';
import { PlaywrightRecorder } from './infrastructure/recording/playwright/PlaywrightRecorder.js';
import { FileReportStore } from './infrastructure/reports/FileReportStore.js';
import { PlaywrightPdfRenderer } from './infrastructure/reports/PlaywrightPdfRenderer.js';
import { SystemFileOpener } from './infrastructure/system/SystemFileOpener.js';
import { CryptoIdGenerator, SystemClock } from './infrastructure/system/system.js';
import { buildServer } from './interfaces/http/server.js';
import { LiveHub } from './interfaces/live/LiveHub.js';
import { VERSION } from './version.js';

function readConfig(): AppConfig {
  loadDotEnv();
  try {
    return parseConfig();
  } catch (error) {
    if (error instanceof ConfigError) {
      process.stderr.write(`${error.message}\n\nRevisa backend/.env (usa backend/.env.example como guía).\n`);
      process.exit(1);
    }
    throw error;
  }
}

/** El adaptador del proveedor elegido; su clave se lee solo aquí. null si falta la clave. */
function createAgentModel(agents: AppConfig['agents']): AgentModel | null {
  if (agents.provider === 'openrouter') {
    const key = openRouterApiKey();
    return key ? new OpenRouterAgentModel(agents.model, key) : null;
  }
  const key = geminiApiKey();
  return key ? new GeminiAgentModel(agents.model, key) : null;
}

/** Composition root: el único lugar que conoce las implementaciones concretas. */
async function main(): Promise<void> {
  const config = readConfig();
  const pinoLogger = createPinoLogger(config);
  const logger = new PinoLoggerAdapter(pinoLogger);

  // Una promesa olvidada (p. ej., de Playwright al cerrarse el navegador) se registra
  // en el log pero no tumba el backend. Un error síncrono sí es fatal: se sale con
  // código 1 y Tauri vuelve a lanzar el proceso.
  process.on('unhandledRejection', (reason) => {
    logger.error('Promesa rechazada sin manejar', {
      error: reason instanceof Error ? reason.stack : String(reason),
    });
  });
  process.on('uncaughtException', (error) => {
    logger.error('Error no controlado; el backend se cierra', { error: error.stack });
    process.exit(1);
  });

  const paths = new SessionPaths(config.dataDir);
  const sessions = new FileSessionRepository(paths, logger);
  const events = new FileEventStore(paths, logger);
  const media = new FileMediaStore(paths);
  const decisions = new FileFindingDecisionStore(paths);
  const liveHub = new LiveHub(logger);
  const registry = new RecordingRegistry(config.maxConcurrentRecordings);
  const recorder = new PlaywrightRecorder({
    videoSize: config.videoSize,
    maxBodyBytes: config.maxBodyBytes,
    headless: config.headless,
    logger,
  });

  const useCases = createUseCases({
    sessions,
    events,
    media,
    decisions,
    reviews: new FileSessionReviewStore(paths),
    renderer: new PlaywrightPdfRenderer(),
    reportStore: new FileReportStore(config.reportsDir),
    opener: new SystemFileOpener(),
    agentModel: createAgentModel(config.agents),
    agentModelName: config.agents.model,
    agentProvider: config.agents.providerName,
    agentRuns: new FileAgentRunStore(paths),
    clock: new SystemClock(),
    ids: new CryptoIdGenerator(),
    notifier: liveHub,
    logger,
    registry,
    recorder,
  });

  const recovered = await useCases.recoverInterruptedSessions.execute();
  if (recovered > 0) logger.warn('Sesiones interrumpidas marcadas como fallidas', { recovered });

  const app = await buildServer({
    useCases,
    registry,
    liveHub,
    logger: pinoLogger,
    authToken: config.authToken,
    allowedOrigins: config.allowedOrigins,
    version: VERSION,
  });

  let shuttingDown = false;
  const shutdown = async (reason: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info('Apagando el backend', { reason });
    await registry.stopAll();
    liveHub.closeAll();
    await app.close();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  // Si Tauri se cierra de golpe, el backend no debe quedar huérfano.
  if (config.parentPid !== undefined) {
    const parentPid = config.parentPid;
    setInterval(() => {
      try {
        process.kill(parentPid, 0);
      } catch {
        void shutdown('el proceso padre terminó');
      }
    }, 2000).unref();
  }

  await app.listen({ host: config.host, port: config.port });
  logger.info('Backend de Rastro listo', {
    url: `http://${config.host}:${config.port}`,
    dataDir: config.dataDir,
    reportsDir: config.reportsDir,
    agents: config.agents.credentials
      ? `${config.agents.providerName} · ${config.agents.model}`
      : 'sin configurar (falta GEMINI_API_KEY u OPENROUTER_API_KEY)',
  });
}

main().catch((error: unknown) => {
  process.stderr.write(`El backend no pudo arrancar: ${error instanceof Error ? error.stack : String(error)}\n`);
  process.exit(1);
});
