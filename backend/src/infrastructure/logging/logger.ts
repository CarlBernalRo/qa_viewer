import { existsSync, renameSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  destination,
  multistream,
  pino,
  type DestinationStream,
  type Logger as PinoLogger,
  type StreamEntry,
} from 'pino';
import pretty from 'pino-pretty';
import type { Logger } from '../../domain/ports.js';
import type { AppConfig } from '../config/env.js';

const MAX_LOG_BYTES = 5 * 1024 * 1024;

const REDACT = {
  // Nunca se escriben tokens ni cookies en los logs.
  paths: ['req.headers.authorization', 'req.headers.cookie', 'req.query.token', '*.token', '*.authToken'],
  censor: '[oculto]',
};

/** Si el log supera 5 MB, se guarda como backend.old.log y se empieza uno nuevo. */
function rotateIfLarge(file: string): void {
  try {
    if (existsSync(file) && statSync(file).size > MAX_LOG_BYTES) {
      renameSync(file, file.replace(/\.log$/, '.old.log'));
    }
  } catch {
    // Si no se puede rotar, se sigue escribiendo en el mismo archivo.
  }
}

/** Un error al escribir logs (consola cerrada, disco lleno) nunca debe tumbar el backend. */
function ignoreErrors<T extends DestinationStream>(stream: T): T {
  (stream as unknown as NodeJS.EventEmitter).on?.('error', () => undefined);
  return stream;
}

/**
 * Logs en el hilo principal, sin transportes en workers: cuando el backend corre
 * como proceso hijo de Tauri, un worker de logging que muere tumbaba todo el proceso.
 * Escribe en consola (legible en desarrollo) y en <dataDir>/logs/backend.log.
 */
export function createPinoLogger(config: Pick<AppConfig, 'env' | 'logLevel' | 'dataDir'>): PinoLogger {
  const level = config.logLevel;
  if (level === 'silent') return pino({ level, redact: REDACT });

  const logFile = join(config.dataDir, 'logs', 'backend.log');
  rotateIfLarge(logFile);

  const consoleStream =
    config.env === 'development' && process.stdout.isTTY
      ? pretty({ translateTime: 'HH:MM:ss', ignore: 'pid,hostname', sync: true })
      : destination({ fd: 1, sync: true });
  const fileStream = destination({ dest: logFile, mkdir: true, sync: false });

  const streams: StreamEntry[] = [
    { level, stream: ignoreErrors(consoleStream) },
    { level, stream: ignoreErrors(fileStream) },
  ];
  return pino({ level, redact: REDACT }, multistream(streams));
}

/** Adapta pino al puerto Logger que usan dominio y aplicación. */
export class PinoLoggerAdapter implements Logger {
  constructor(private readonly log: PinoLogger) {}

  debug(message: string, context: Record<string, unknown> = {}): void {
    this.log.debug(context, message);
  }

  info(message: string, context: Record<string, unknown> = {}): void {
    this.log.info(context, message);
  }

  warn(message: string, context: Record<string, unknown> = {}): void {
    this.log.warn(context, message);
  }

  error(message: string, context: Record<string, unknown> = {}): void {
    this.log.error(context, message);
  }
}
