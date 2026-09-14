import { spawn } from 'node:child_process';
import { dirname } from 'node:path';
import type { FileOpener } from '../../domain/ports.js';

function launch(command: string, args: string[], verbatim = false): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { detached: true, stdio: 'ignore', windowsVerbatimArguments: verbatim });
    child.once('error', reject);
    child.once('spawn', () => {
      child.unref();
      resolve();
    });
  });
}

/**
 * Abre archivos con el programa predeterminado del sistema. Nunca pasa por una shell:
 * la ruta es un argumento, no parte de un comando.
 */
export class SystemFileOpener implements FileOpener {
  open(path: string): Promise<void> {
    if (process.platform === 'win32') return launch('explorer.exe', [path]);
    if (process.platform === 'darwin') return launch('open', [path]);
    return launch('xdg-open', [path]);
  }

  reveal(path: string): Promise<void> {
    // explorer solo entiende el formato exacto /select,"ruta", sin que Node agregue sus comillas.
    if (process.platform === 'win32') return launch('explorer.exe', [`/select,"${path}"`], true);
    if (process.platform === 'darwin') return launch('open', ['-R', path]);
    return launch('xdg-open', [dirname(path)]);
  }
}
