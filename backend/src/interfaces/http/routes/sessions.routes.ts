import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import {
  addMarkerInputSchema,
  API_ROUTES,
  captureEventSchema,
  createSessionInputSchema,
  openReportInputSchema,
  setCriterionVerdictInputSchema,
  setFindingDecisionInputSchema,
} from '@rastro/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { UseCases } from '../../../application/index.js';
import { HttpError, parseOrThrow } from '../errors.js';

const idParams = z.object({ id: z.string().min(1).max(80) });
const findingParams = z.object({ id: z.string().min(1).max(80), findingId: z.string().min(1).max(120) });
const markerParams = z.object({ id: z.string().min(1).max(80), markerId: z.string().min(1).max(80) });
const criterionParams = z.object({ id: z.string().min(1).max(80), criterionId: z.string().regex(/^CA\d+$/) });

const kindSchema = captureEventSchema.options.map((option) => option.shape.kind.value);
const eventsQuery = z.object({
  kinds: z
    .string()
    .optional()
    .transform((value) => (value ? value.split(',') : undefined))
    .pipe(z.array(z.enum(kindSchema as [string, ...string[]])).optional()),
  fromT: z.coerce.number().nonnegative().optional(),
  limit: z.coerce.number().int().min(1).max(50_000).optional(),
});

/** Interpreta `Range: bytes=inicio-fin` para que el reproductor pueda adelantar el video. */
function parseRange(header: string | undefined, size: number): { start: number; end: number } | null {
  const match = header ? /^bytes=(\d*)-(\d*)$/.exec(header) : null;
  if (!match) return null;
  const [, rawStart = '', rawEnd = ''] = match;
  let start = rawStart === '' ? size - Number(rawEnd) : Number(rawStart);
  let end = rawStart !== '' && rawEnd !== '' ? Number(rawEnd) : size - 1;
  start = Math.max(0, start);
  end = Math.min(end, size - 1);
  if (Number.isNaN(start) || Number.isNaN(end) || start > end) {
    throw new HttpError(416, 'RANGE_NOT_SATISFIABLE', 'El rango pedido no es válido.');
  }
  return { start, end };
}

export async function sessionRoutes(app: FastifyInstance, useCases: UseCases): Promise<void> {
  app.get(API_ROUTES.sessions, async () => useCases.listSessions.execute());

  app.post(API_ROUTES.sessions, async (request, reply) => {
    const input = parseOrThrow(createSessionInputSchema, request.body);
    const session = await useCases.createSession.execute(input);
    return reply.status(201).send(session);
  });

  app.get('/api/sessions/:id', async (request) => {
    const { id } = parseOrThrow(idParams, request.params);
    return useCases.getSession.execute(id);
  });

  app.delete('/api/sessions/:id', async (request, reply) => {
    const { id } = parseOrThrow(idParams, request.params);
    await useCases.deleteSession.execute(id);
    return reply.status(204).send();
  });

  app.get('/api/sessions/:id/events', async (request) => {
    const { id } = parseOrThrow(idParams, request.params);
    const query = parseOrThrow(eventsQuery, request.query);
    return useCases.getSessionEvents.execute(id, {
      ...(query.kinds ? { kinds: query.kinds as never } : {}),
      ...(query.fromT !== undefined ? { fromT: query.fromT } : {}),
      ...(query.limit !== undefined ? { limit: query.limit } : {}),
    });
  });

  app.get('/api/sessions/:id/findings', async (request) => {
    const { id } = parseOrThrow(idParams, request.params);
    return useCases.analyzeSession.execute(id);
  });

  app.put('/api/sessions/:id/findings/:findingId/decision', async (request) => {
    const { id, findingId } = parseOrThrow(findingParams, request.params);
    const input = parseOrThrow(setFindingDecisionInputSchema, request.body);
    return useCases.setFindingDecision.execute(id, findingId, input);
  });

  app.get('/api/sessions/:id/review', async (request) => {
    const { id } = parseOrThrow(idParams, request.params);
    return useCases.getSessionReview.execute(id);
  });

  app.post('/api/sessions/:id/markers', async (request, reply) => {
    const { id } = parseOrThrow(idParams, request.params);
    const input = parseOrThrow(addMarkerInputSchema, request.body ?? {});
    return reply.status(201).send(await useCases.addMarker.execute(id, input));
  });

  app.delete('/api/sessions/:id/markers/:markerId', async (request) => {
    const { id, markerId } = parseOrThrow(markerParams, request.params);
    return useCases.removeMarker.execute(id, markerId);
  });

  app.put('/api/sessions/:id/criteria/:criterionId', async (request) => {
    const { id, criterionId } = parseOrThrow(criterionParams, request.params);
    const input = parseOrThrow(setCriterionVerdictInputSchema, request.body);
    return useCases.setCriterionVerdict.execute(id, criterionId, input);
  });

  app.post('/api/sessions/:id/report', async (request) => {
    const { id } = parseOrThrow(idParams, request.params);
    return useCases.exportSessionReport.execute(id);
  });

  app.post('/api/sessions/:id/report/open', async (request, reply) => {
    const { id } = parseOrThrow(idParams, request.params);
    const { reveal } = parseOrThrow(openReportInputSchema, request.body ?? {});
    await useCases.openSessionReport.execute(id, reveal);
    return reply.status(204).send();
  });

  app.post('/api/sessions/:id/recording/start', async (request) => {
    const { id } = parseOrThrow(idParams, request.params);
    return useCases.startRecording.execute(id);
  });

  app.post('/api/sessions/:id/recording/stop', async (request) => {
    const { id } = parseOrThrow(idParams, request.params);
    return useCases.stopRecording.execute(id);
  });

  app.get('/api/sessions/:id/video', async (request, reply) => {
    const { id } = parseOrThrow(idParams, request.params);
    const path = await useCases.getSessionVideo.execute(id);
    const { size } = await stat(path);
    const range = parseRange(request.headers.range, size);
    void reply.header('Content-Type', 'video/webm').header('Accept-Ranges', 'bytes');
    if (!range) {
      return reply.header('Content-Length', size).send(createReadStream(path));
    }
    return reply
      .status(206)
      .header('Content-Range', `bytes ${range.start}-${range.end}/${size}`)
      .header('Content-Length', range.end - range.start + 1)
      .send(createReadStream(path, { start: range.start, end: range.end }));
  });
}
