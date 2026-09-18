import { randomUUID } from 'node:crypto';
import { mkdir, readdir, rename, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

function errorCode(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null ? (error as NodeJS.ErrnoException).code : undefined;
}

export function isNotFound(error: unknown): boolean {
  return errorCode(error) === 'ENOENT';
}

/** En Windows un archivo recién cerrado puede seguir bloqueado un momento (antivirus, indexador, ffmpeg). */
export function isBusy(error: unknown): boolean {
  const code = errorCode(error);
  return code === 'EBUSY' || code === 'EPERM' || code === 'EACCES';
}

/** Reintenta una operación de disco mientras el archivo esté bloqueado. */
export async function retryWhileBusy<T>(
  operation: () => Promise<T>,
  { attempts = 8, delayMs = 250 }: { attempts?: number; delayMs?: number } = {},
): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (!isBusy(error) || attempt >= attempts) throw error;
      await new Promise((resolve) => setTimeout(resolve, delayMs * attempt));
    }
  }
}

/** Escribe en un temporal y renombra: el archivo nunca queda a medio escribir. */
export async function writeFileAtomic(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.${randomUUID()}.tmp`;
  await writeFile(tmp, content, 'utf8');
  await retryWhileBusy(() => rename(tmp, path));
}

/** Bytes totales de una carpeta (recursivo). 0 si no existe. */
export async function folderSize(dir: string): Promise<number> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (isNotFound(error)) return 0;
    throw error;
  }
  let total = 0;
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      total += await folderSize(path);
    } else if (entry.isFile()) {
      total += (await stat(path)).size;
    }
  }
  return total;
}
