import { API_ROUTES } from '@rastro/shared';
import { pino } from 'pino';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createUseCases } from '../../src/application/index.js';
import { buildServer } from '../../src/interfaces/http/server.js';
import { LiveHub } from '../../src/interfaces/live/LiveHub.js';
import { createTestDeps, silentLogger } from '../fakes.js';
import { sampleInput } from '../samples.js';

const TOKEN = 'token-de-prueba-con-mas-de-32-caracteres';
const auth = { authorization: `Bearer ${TOKEN}`, host: '127.0.0.1:4318' };

let app: FastifyInstance;

beforeEach(async () => {
  const deps = createTestDeps();
  app = await buildServer({
    useCases: createUseCases(deps),
    registry: deps.registry,
    liveHub: new LiveHub(silentLogger),
    logger: pino({ level: 'silent' }),
    authToken: TOKEN,
    allowedOrigins: ['http://localhost:5173'],
    version: 'test',
  });
});

afterEach(async () => {
  await app.close();
});

describe('seguridad', () => {
  it('health responde sin token', async () => {
    const response = await app.inject({ method: 'GET', url: API_ROUTES.health, headers: { host: '127.0.0.1:4318' } });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: 'ok', activeRecordings: 0 });
  });

  it('rechaza requests sin token o con token incorrecto', async () => {
    const noToken = await app.inject({ method: 'GET', url: API_ROUTES.sessions, headers: { host: '127.0.0.1:4318' } });
    const wrong = await app.inject({
      method: 'GET',
      url: API_ROUTES.sessions,
      headers: { host: '127.0.0.1:4318', authorization: 'Bearer otro-token' },
    });
    expect(noToken.statusCode).toBe(401);
    expect(wrong.statusCode).toBe(401);
  });

  it('rechaza orígenes no permitidos y hosts que no son locales', async () => {
    const origin = await app.inject({
      method: 'GET',
      url: API_ROUTES.sessions,
      headers: { ...auth, origin: 'https://sitio-malicioso.test' },
    });
    const host = await app.inject({
      method: 'GET',
      url: API_ROUTES.sessions,
      headers: { ...auth, host: 'rastro.atacante.test' },
    });
    expect(origin.statusCode).toBe(403);
    expect(host.statusCode).toBe(403);
  });
});

describe('sesiones', () => {
  it('crea una sesión válida y la lista', async () => {
    const created = await app.inject({ method: 'POST', url: API_ROUTES.sessions, headers: auth, payload: sampleInput() });
    expect(created.statusCode).toBe(201);
    const list = await app.inject({ method: 'GET', url: API_ROUTES.sessions, headers: auth });
    expect(list.json()).toHaveLength(1);
  });

  it('responde 400 con detalle cuando faltan datos', async () => {
    const input = sampleInput();
    const response = await app.inject({
      method: 'POST',
      url: API_ROUTES.sessions,
      headers: auth,
      payload: { ...input, objective: { ...input.objective, criteria: [] } },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('VALIDATION_ERROR');
  });

  it('responde 501 si se pide análisis con agentes', async () => {
    const response = await app.inject({
      method: 'POST',
      url: API_ROUTES.sessions,
      headers: auth,
      payload: sampleInput({ analysisMode: 'manual' }),
    });
    expect(response.statusCode).toBe(501);
  });

  it('elimina una sesión y responde 204', async () => {
    const created = await app.inject({ method: 'POST', url: API_ROUTES.sessions, headers: auth, payload: sampleInput() });
    const { id } = created.json() as { id: string };
    const removed = await app.inject({ method: 'DELETE', url: API_ROUTES.session(id), headers: auth });
    expect(removed.statusCode).toBe(204);
    const after = await app.inject({ method: 'GET', url: API_ROUTES.session(id), headers: auth });
    expect(after.statusCode).toBe(404);
  });

  it('responde 409 si se piden hallazgos de una sesión que no se grabó', async () => {
    const created = await app.inject({ method: 'POST', url: API_ROUTES.sessions, headers: auth, payload: sampleInput() });
    const { id } = created.json() as { id: string };
    const response = await app.inject({ method: 'GET', url: API_ROUTES.sessionFindings(id), headers: auth });
    expect(response.statusCode).toBe(409);
  });

  it('informa que los agentes no están configurados y responde 501 al lanzarlos', async () => {
    const status = await app.inject({ method: 'GET', url: API_ROUTES.agentStatus, headers: auth });
    expect(status.statusCode).toBe(200);
    expect(status.json()).toMatchObject({ available: false, provider: 'Google Gemini', model: 'gemini-2.5-pro' });

    const created = await app.inject({ method: 'POST', url: API_ROUTES.sessions, headers: auth, payload: sampleInput() });
    const { id } = created.json() as { id: string };
    const start = await app.inject({ method: 'POST', url: API_ROUTES.sessionAgents(id), headers: auth });
    expect(start.statusCode).toBe(501);
    const list = await app.inject({ method: 'GET', url: API_ROUTES.sessionAgents(id), headers: auth });
    expect(list.json()).toEqual({ runs: [] });
  });

  it('responde 409 al exportar el informe de una sesión sin grabar', async () => {
    const created = await app.inject({ method: 'POST', url: API_ROUTES.sessions, headers: auth, payload: sampleInput() });
    const { id } = created.json() as { id: string };
    const response = await app.inject({ method: 'POST', url: API_ROUTES.sessionReport(id), headers: auth });
    expect(response.statusCode).toBe(409);
  });

  it('confirma un hallazgo por HTTP y responde 404 si el hallazgo no existe', async () => {
    const created = await app.inject({ method: 'POST', url: API_ROUTES.sessions, headers: auth, payload: sampleInput() });
    const { id } = created.json() as { id: string };
    await app.inject({ method: 'POST', url: API_ROUTES.startRecording(id), headers: auth });
    await app.inject({ method: 'POST', url: API_ROUTES.stopRecording(id), headers: auth });

    const missing = await app.inject({
      method: 'PUT',
      url: API_ROUTES.findingDecision(id, 'no-existe'),
      headers: auth,
      payload: { decision: 'confirmed' },
    });
    expect(missing.statusCode).toBe(404);
  });

  it('responde 404 para una sesión inexistente', async () => {
    const response = await app.inject({ method: 'GET', url: API_ROUTES.session('ses_no-existe'), headers: auth });
    expect(response.statusCode).toBe(404);
  });
});
