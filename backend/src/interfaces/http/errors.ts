import type { ApiError } from '@rastro/shared';
import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { DomainError } from '../../domain/errors.js';

export class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

const STATUS_BY_DOMAIN_CODE: Record<string, number> = {
  NOT_FOUND: 404,
  INVALID_STATE: 409,
  LIMIT_REACHED: 409,
  INVALID_OBJECTIVE: 422,
  FEATURE_NOT_AVAILABLE: 501,
  RECORDER_FAILED: 502,
};

/** Valida con zod y convierte los errores en un 400 con detalle por campo. */
export function parseOrThrow<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'La solicitud tiene datos inválidos.', z.flattenError(result.error));
  }
  return result.data;
}

function body(code: string, message: string, details?: unknown): ApiError {
  return { error: { code, message, ...(details !== undefined ? { details } : {}) } };
}

/** Traduce errores a respuestas HTTP. Los errores inesperados nunca exponen su mensaje interno. */
export function errorHandler(error: FastifyError | Error, request: FastifyRequest, reply: FastifyReply): void {
  if (error instanceof HttpError) {
    void reply.status(error.statusCode).send(body(error.code, error.message, error.details));
    return;
  }
  if (error instanceof DomainError) {
    void reply.status(STATUS_BY_DOMAIN_CODE[error.code] ?? 400).send(body(error.code, error.message));
    return;
  }
  const statusCode = (error as FastifyError).statusCode;
  if (statusCode && statusCode < 500) {
    void reply.status(statusCode).send(body((error as FastifyError).code ?? 'BAD_REQUEST', error.message));
    return;
  }
  request.log.error({ err: error }, 'Error no controlado');
  void reply.status(500).send(body('INTERNAL_ERROR', 'Ocurrió un error inesperado. Revisa los logs del backend.'));
}
