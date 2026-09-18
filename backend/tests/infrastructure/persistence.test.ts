import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AgentRun } from '@rastro/shared';
import type { AgentCheckpoint } from '../../src/domain/ports.js';
import { Session } from '../../src/domain/session/Session.js';
import { FileAgentRunStore } from '../../src/infrastructure/persistence/FileAgentRunStore.js';
import { FileAgentSettingsStore } from '../../src/infrastructure/persistence/FileAgentSettingsStore.js';
import { FileEventStore } from '../../src/infrastructure/persistence/FileEventStore.js';
import { FileSessionRepository } from '../../src/infrastructure/persistence/FileSessionRepository.js';
import { SessionPaths } from '../../src/infrastructure/persistence/SessionPaths.js';
import { SequentialIds, silentLogger } from '../fakes.js';
import { sampleInput } from '../samples.js';

let dataDir: string;
let paths: SessionPaths;

beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'rastro-test-'));
  paths = new SessionPaths(dataDir);
});

afterEach(async () => {
  await rm(dataDir, { recursive: true, force: true });
});

function newSession(): Session {
  const input = sampleInput();
  return Session.create({ id: new SequentialIds().sessionId(), now: new Date(), ...input });
}

describe('FileSessionRepository', () => {
  it('guarda y vuelve a leer una sesión', async () => {
    const repo = new FileSessionRepository(paths, silentLogger);
    const session = newSession();
    await repo.save(session);
    expect((await repo.findById(session.id))?.toDto()).toEqual(session.toDto());
    expect(await repo.list()).toHaveLength(1);
  });

  it('elimina la sesión con todos sus archivos', async () => {
    const repo = new FileSessionRepository(paths, silentLogger);
    const session = newSession();
    await repo.save(session);
    await repo.delete(session.id);
    expect(await repo.findById(session.id)).toBeNull();
    expect(await repo.list()).toHaveLength(0);
  });

  it('no acepta ids que intentan salir de la carpeta de datos', async () => {
    const repo = new FileSessionRepository(paths, silentLogger);
    expect(await repo.findById('../../etc/passwd')).toBeNull();
    expect(() => paths.dir('../fuera')).toThrow();
  });
});

describe('FileEventStore', () => {
  it('guarda los eventos en orden y los filtra por tipo', async () => {
    const store = new FileEventStore(paths, silentLogger);
    const id = newSession().id;
    store.append(id, { id: 'e1', t: 1, pageId: 'p1', kind: 'navigation', url: 'https://qa.test' });
    store.append(id, { id: 'e2', t: 2, pageId: 'p1', kind: 'exception', message: 'boom' });
    await store.flush(id);
    expect((await store.read(id)).map((event) => event.id)).toEqual(['e1', 'e2']);
    expect(await store.read(id, { kinds: ['exception'] })).toHaveLength(1);
  });
});

describe('FileAgentSettingsStore', () => {
  it('sin overrides guardados, devuelve vacío para cualquier agente (round-trip real por disco, no un fake)', async () => {
    const store = new FileAgentSettingsStore(join(dataDir, 'agent-settings.json'));
    expect(await store.get('api')).toEqual({});
    expect(await store.getAll()).toEqual({});
  });

  it('guarda un override, lo lee de vuelta y no toca a los demás agentes', async () => {
    const store = new FileAgentSettingsStore(join(dataDir, 'agent-settings.json'));
    await store.set('api', { color: '#123456', mainObjective: 'A medida.' });
    await store.set('frontend', { color: '#654321' });

    expect(await store.get('api')).toEqual({ color: '#123456', mainObjective: 'A medida.' });
    expect(await store.get('lead')).toEqual({});
    expect(await store.getAll()).toEqual({
      api: { color: '#123456', mainObjective: 'A medida.' },
      frontend: { color: '#654321' },
    });
  });
});

describe('FileAgentRunStore', () => {
  const sessionId = new SequentialIds().sessionId();
  const run: AgentRun = {
    id: 'r1',
    sessionId,
    status: 'failed',
    model: 'gemini-2.5-pro',
    startedAt: '2026-09-17T10:00:00.000Z',
    steps: [{ agentId: 'api', status: 'done' }, { agentId: 'frontend', status: 'failed' }],
    proposals: [],
    findings: [],
    usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
  };

  it('guarda y lee de vuelta un punto de control (round-trip real por disco)', async () => {
    const store = new FileAgentRunStore(paths);
    const checkpoint: AgentCheckpoint = {
      brief: 'resumen',
      digests: { api: 'a', frontend: 'b', sec: 'c', a11y: 'd', perf: 'e', rt: 'f', func: 'g', env: 'h', ux: 'i', reg: 'j' },
      refs: [['E1', 'evt-1']],
      reports: {},
    };
    await store.saveCheckpoint(sessionId, 'r1', checkpoint);
    expect(await store.loadCheckpoint(sessionId, 'r1')).toEqual(checkpoint);
  });

  it('un punto de control de antes de agregar un especialista (le faltan claves) se trata como si no existiera', async () => {
    // Simula un checkpoint real que quedó en disco de una versión anterior del schema, con solo
    // 2 especialistas — exactamente lo que reintentar una corrida vieja de "Elegir yo" encontraba
    // y hacía fallar con un 500 antes de este fix.
    const dir = join(paths.dir(sessionId), 'agent-checkpoints');
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, 'r1.json'),
      JSON.stringify({ brief: 'resumen', digests: { api: 'a', frontend: 'b' }, refs: [], reports: {} }),
    );
    const store = new FileAgentRunStore(paths);
    expect(await store.loadCheckpoint(sessionId, 'r1')).toBeNull();
  });

  it('sin archivo de punto de control, devuelve null', async () => {
    const store = new FileAgentRunStore(paths);
    expect(await store.loadCheckpoint(sessionId, 'no-existe')).toBeNull();
  });

  it('guarda la corrida y la vuelve a leer, la más reciente primero', async () => {
    const store = new FileAgentRunStore(paths);
    await store.save(run);
    await store.save({ ...run, id: 'r2', startedAt: '2026-09-17T11:00:00.000Z' });
    const runs = await store.list(sessionId);
    expect(runs.map((item) => item.id)).toEqual(['r2', 'r1']);
  });
});
