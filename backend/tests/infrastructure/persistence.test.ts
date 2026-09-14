import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Session } from '../../src/domain/session/Session.js';
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
