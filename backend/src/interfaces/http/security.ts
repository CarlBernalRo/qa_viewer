import { createHash, timingSafeEqual } from 'node:crypto';
import type { FastifyRequest } from 'fastify';
import { HttpError } from './errors.js';

const LOOPBACK_HOST = /^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/i;

function digest(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

/** Comparación en tiempo constante, aunque los largos no coincidan. */
export function tokensMatch(received: string, expected: string): boolean {
  return timingSafeEqual(digest(received), digest(expected));
}

export interface SecurityOptions {
  authToken: string;
  allowedOrigins: readonly string[];
  /** Rutas que no requieren token (solo lectura y sin datos sensibles). */
  publicPaths: readonly string[];
  /** Rutas que aceptan el token por query, porque el navegador no puede enviar headers (video, WebSocket). */
  queryTokenPaths: readonly RegExp[];
}

/**
 * Hook de seguridad para cada request:
 * 1. Host de loopback (evita DNS rebinding).
 * 2. Origin permitido, si viene (evita que otra web del navegador llame al backend).
 * 3. Token Bearer, o por query solo en las rutas que lo necesitan.
 */
export function createSecurityHook(options: SecurityOptions) {
  const allowed = new Set(options.allowedOrigins);
  const isPublic = (path: string) => options.publicPaths.includes(path);
  const acceptsQueryToken = (path: string) => options.queryTokenPaths.some((pattern) => pattern.test(path));

  return async function securityHook(request: FastifyRequest): Promise<void> {
    const host = request.headers.host ?? '';
    if (!LOOPBACK_HOST.test(host)) {
      throw new HttpError(403, 'FORBIDDEN_HOST', 'Solo se aceptan conexiones locales.');
    }
    const origin = request.headers.origin;
    if (origin && !allowed.has(origin)) {
      throw new HttpError(403, 'FORBIDDEN_ORIGIN', `El origen ${origin} no está permitido.`);
    }
    if (request.method === 'OPTIONS') return;

    const path = request.url.split('?')[0] ?? '';
    if (isPublic(path)) return;

    const header = request.headers.authorization;
    let token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : undefined;
    if (!token && acceptsQueryToken(path)) {
      const query = request.query as Record<string, unknown> | undefined;
      token = typeof query?.token === 'string' ? query.token : undefined;
    }
    if (!token || !tokensMatch(token, options.authToken)) {
      throw new HttpError(401, 'UNAUTHORIZED', 'Falta el token de acceso o no es válido.');
    }
  };
}
