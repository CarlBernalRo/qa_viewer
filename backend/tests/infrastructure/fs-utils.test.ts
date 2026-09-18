import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { folderSize, retryWhileBusy } from '../../src/infrastructure/persistence/fs-utils.js';

const busy = () => Object.assign(new Error('EBUSY: resource busy or locked'), { code: 'EBUSY' });

describe('retryWhileBusy', () => {
  it('reintenta mientras el archivo está bloqueado y devuelve el resultado', async () => {
    let calls = 0;
    const result = await retryWhileBusy(
      async () => {
        calls += 1;
        if (calls < 3) throw busy();
        return 'ok';
      },
      { delayMs: 1 },
    );
    expect(result).toBe('ok');
    expect(calls).toBe(3);
  });

  it('se rinde después del máximo de intentos', async () => {
    let calls = 0;
    await expect(
      retryWhileBusy(
        async () => {
          calls += 1;
          throw busy();
        },
        { attempts: 4, delayMs: 1 },
      ),
    ).rejects.toThrow('EBUSY');
    expect(calls).toBe(4);
  });

  it('no reintenta errores que no son de bloqueo', async () => {
    let calls = 0;
    await expect(
      retryWhileBusy(async () => {
        calls += 1;
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      }),
    ).rejects.toThrow('ENOENT');
    expect(calls).toBe(1);
  });
});

describe('folderSize', () => {
  it('suma los bytes de todos los archivos, incluidos los de subcarpetas', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'rastro-folder-size-'));
    await writeFile(join(dir, 'video.webm'), Buffer.alloc(100));
    await mkdir(join(dir, 'agent-checkpoints'));
    await writeFile(join(dir, 'agent-checkpoints', 'run1.json'), Buffer.alloc(50));
    await expect(folderSize(dir)).resolves.toBe(150);
  });

  it('devuelve 0 si la carpeta no existe', async () => {
    await expect(folderSize(join(tmpdir(), 'rastro-no-existe-jamas'))).resolves.toBe(0);
  });
});
