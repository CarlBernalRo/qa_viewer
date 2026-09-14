import { randomUUID } from 'node:crypto';
import { access, mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { InvalidStateError } from '../../domain/errors.js';
import type { ReportStore } from '../../domain/ports.js';
import { isBusy, retryWhileBusy } from '../persistence/fs-utils.js';

/** Solo nombres generados por Rastro: nada de rutas ni caracteres raros. */
const SAFE_NAME = /^[a-z0-9-]{1,80}\.pdf$/;

/** Guarda los informes en una carpeta del usuario (por defecto, Descargas/Rastro). */
export class FileReportStore implements ReportStore {
  constructor(private readonly dir: string) {}

  async save(fileName: string, content: Uint8Array): Promise<string> {
    const target = this.pathOf(fileName);
    await mkdir(this.dir, { recursive: true });
    const tmp = join(this.dir, `.${randomUUID()}.tmp`);
    await writeFile(tmp, content);
    try {
      await retryWhileBusy(() => rename(tmp, target), { attempts: 3 });
    } catch (error) {
      await rm(tmp, { force: true }).catch(() => undefined);
      if (isBusy(error)) {
        throw new InvalidStateError(
          `El informe anterior (${fileName}) está abierto en otro programa. Ciérralo y vuelve a exportar.`,
        );
      }
      throw error;
    }
    return target;
  }

  async find(fileName: string): Promise<string | null> {
    const target = this.pathOf(fileName);
    try {
      await access(target);
      return target;
    } catch {
      return null;
    }
  }

  private pathOf(fileName: string): string {
    if (!SAFE_NAME.test(fileName)) throw new InvalidStateError('El nombre del informe no es válido.');
    return join(this.dir, fileName);
  }
}
