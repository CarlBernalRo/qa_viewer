import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseEnv } from 'node:util';
import { z } from 'zod';

const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1', 'localhost']);

const booleanString = z.enum(['true', 'false']).transform((value) => value === 'true');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  RASTRO_HOST: z
    .string()
    .default('127.0.0.1')
    .refine((host) => LOOPBACK_HOSTS.has(host), {
      message: 'RASTRO_HOST debe ser una dirección de loopback (127.0.0.1, ::1 o localhost).',
    }),
  RASTRO_PORT: z.coerce.number().int().min(1024).max(65535).default(4318),
  RASTRO_AUTH_TOKEN: z.string().min(32, 'RASTRO_AUTH_TOKEN debe tener al menos 32 caracteres.'),
  RASTRO_ALLOWED_ORIGINS: z
    .string()
    .default('http://localhost:5173')
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
    ),
  RASTRO_DATA_DIR: z.string().min(1).default('./data'),
  RASTRO_LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),
  RASTRO_MAX_CONCURRENT_RECORDINGS: z.coerce.number().int().min(1).max(5).default(1),
  RASTRO_MAX_BODY_BYTES: z.coerce
    .number()
    .int()
    .min(0)
    .max(10 * 1024 * 1024)
    .default(262_144),
  RASTRO_VIDEO_SIZE: z
    .string()
    .regex(/^\d{3,4}x\d{3,4}$/, 'RASTRO_VIDEO_SIZE debe tener la forma 1600x900.')
    .default('1600x900'),
  RASTRO_BROWSER_HEADLESS: booleanString.default(false),
  /** Carpeta de los informes PDF. Por defecto, Descargas/Rastro del usuario. */
  RASTRO_REPORTS_DIR: z.string().min(1).optional(),
  /** Proveedor de los agentes. "auto": OpenRouter si hay OPENROUTER_API_KEY; si no, Gemini directo. */
  RASTRO_AGENT_PROVIDER: z.enum(['auto', 'gemini', 'openrouter']).default('auto'),
  /** Modelo de los agentes. Por defecto: gemini-2.5-pro (Gemini) o google/gemini-2.5-pro (OpenRouter). */
  RASTRO_AGENT_MODEL: z.string().min(1).optional(),
  /** PID del proceso que lanzó el backend (Tauri). Si muere, el backend se apaga solo. */
  RASTRO_PARENT_PID: z.coerce.number().int().positive().optional(),
});

export type LogLevel = 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent';

export interface AppConfig {
  env: 'development' | 'production' | 'test';
  host: string;
  port: number;
  authToken: string;
  allowedOrigins: string[];
  dataDir: string;
  logLevel: LogLevel;
  maxConcurrentRecordings: number;
  maxBodyBytes: number;
  /** Tamaño del video (y de la página cuando el navegador corre sin ventana). */
  videoSize: { width: number; height: number };
  headless: boolean;
  reportsDir: string;
  agents: {
    provider: AgentProvider;
    /** Nombre para mostrar (a quién se envía el resumen). */
    providerName: string;
    model: string;
    /** Hay clave del proveedor en el entorno (la configuración no guarda ni muestra su valor). */
    credentials: boolean;
  };
  parentPid?: number;
}

export class ConfigError extends Error {
  override name = 'ConfigError';
}

/**
 * Carga un archivo .env sin pisar variables ya definidas: lo que pasa Tauri
 * (o el sistema) siempre tiene prioridad sobre el archivo.
 */
export function loadDotEnv(path = '.env'): void {
  if (!existsSync(path)) return;
  const parsed = parseEnv(readFileSync(path, 'utf8'));
  for (const [key, value] of Object.entries(parsed)) {
    if (process.env[key] === undefined && value !== undefined) process.env[key] = value;
  }
}

export type AgentProvider = 'gemini' | 'openrouter';

/**
 * Las claves de los proveedores se leen aparte y solo donde se crea el cliente: no forman
 * parte de AppConfig, así nunca terminan en un log de la configuración.
 */
export function geminiApiKey(source: NodeJS.ProcessEnv = process.env): string | undefined {
  return source['GEMINI_API_KEY']?.trim() || undefined;
}

export function openRouterApiKey(source: NodeJS.ProcessEnv = process.env): string | undefined {
  return source['OPENROUTER_API_KEY']?.trim() || undefined;
}

function resolveAgents(
  choice: 'auto' | AgentProvider,
  model: string | undefined,
  source: NodeJS.ProcessEnv,
): AppConfig['agents'] {
  const provider: AgentProvider = choice === 'auto' ? (openRouterApiKey(source) ? 'openrouter' : 'gemini') : choice;
  if (provider === 'openrouter') {
    const raw = model ?? 'google/gemini-2.5-pro';
    // En OpenRouter los modelos llevan el prefijo del proveedor: gemini-2.5-pro → google/gemini-2.5-pro.
    const named = !raw.includes('/') && raw.startsWith('gemini') ? `google/${raw}` : raw;
    return { provider, providerName: 'OpenRouter', model: named, credentials: Boolean(openRouterApiKey(source)) };
  }
  return {
    provider,
    providerName: 'Google Gemini',
    model: model ?? 'gemini-2.5-pro',
    credentials: Boolean(geminiApiKey(source)),
  };
}

export function parseConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    throw new ConfigError(`Configuración inválida:\n${z.prettifyError(result.error)}`);
  }
  const env = result.data;
  const [width, height] = env.RASTRO_VIDEO_SIZE.split('x').map(Number) as [number, number];
  return {
    env: env.NODE_ENV,
    host: env.RASTRO_HOST,
    port: env.RASTRO_PORT,
    authToken: env.RASTRO_AUTH_TOKEN,
    allowedOrigins: env.RASTRO_ALLOWED_ORIGINS,
    dataDir: resolve(env.RASTRO_DATA_DIR),
    logLevel: env.RASTRO_LOG_LEVEL,
    maxConcurrentRecordings: env.RASTRO_MAX_CONCURRENT_RECORDINGS,
    maxBodyBytes: env.RASTRO_MAX_BODY_BYTES,
    videoSize: { width, height },
    headless: env.RASTRO_BROWSER_HEADLESS,
    reportsDir: env.RASTRO_REPORTS_DIR ? resolve(env.RASTRO_REPORTS_DIR) : join(homedir(), 'Downloads', 'Rastro'),
    agents: resolveAgents(env.RASTRO_AGENT_PROVIDER, env.RASTRO_AGENT_MODEL, source),
    ...(env.RASTRO_PARENT_PID !== undefined ? { parentPid: env.RASTRO_PARENT_PID } : {}),
  };
}
