import { join } from 'node:path';
import type { RawCaptureEvent } from '@rastro/shared';
import type { Page } from 'playwright';

export interface ScreenshotCaptureOptions {
  pageId: string;
  /** Carpeta donde dejar los archivos, ya creada. */
  dir: string;
  emit: (event: RawCaptureEvent) => void;
  onError: (message: string, error: unknown) => void;
  /** Espera tras navegar, para que la pantalla termine de dibujarse. */
  settleMs?: number;
  /** Tope de pantallas capturadas por pestaña. */
  maxScans?: number;
}

/** Pantalla a capturar: sin query (mismos datos, otra búsqueda) pero con hash (rutas de SPA). */
function screenKey(raw: string): string | null {
  try {
    const url = new URL(raw);
    return url.protocol === 'http:' || url.protocol === 'https:' ? `${url.origin}${url.pathname}${url.hash}` : null;
  } catch {
    return null;
  }
}

/** Errores esperables: se navegó o se cerró la pestaña a mitad de la captura. */
const INTERRUPTED = /context|destroyed|closed|navigat|detached/i;

/**
 * Guarda una captura de cada pantalla distinta que se visitó (por pestaña), para que el
 * agente UI/UX las reciba como evidencia visual. Solo viewport, en JPEG liviano: no hace
 * falta la resolución completa para detectar problemas de layout o consistencia.
 */
export function attachScreenshotCapture(page: Page, options: ScreenshotCaptureOptions): void {
  const { pageId, dir, emit, onError, settleMs = 1500, maxScans = 20 } = options;
  const scanned = new Set<string>();
  let seq = 0;
  let timer: NodeJS.Timeout | undefined;
  let running = false;
  let closed = false;

  const schedule = (): void => {
    clearTimeout(timer);
    timer = setTimeout(() => void capture(), settleMs);
  };

  const capture = async (): Promise<void> => {
    if (closed) return;
    if (running) {
      schedule();
      return;
    }
    const url = page.url();
    const key = screenKey(url);
    if (!key || scanned.has(key) || scanned.size >= maxScans) return;
    running = true;
    scanned.add(key);
    try {
      seq += 1;
      const file = `${pageId}-${String(seq).padStart(3, '0')}.jpg`;
      await page.screenshot({ path: join(dir, file), type: 'jpeg', quality: 60, fullPage: false, timeout: 10_000 });
      emit({ kind: 'screenshot', pageId, url, file });
    } catch (error) {
      scanned.delete(key);
      const message = error instanceof Error ? error.message : String(error);
      if (!closed && !INTERRUPTED.test(message)) onError('No se pudo capturar la pantalla', error);
    } finally {
      running = false;
    }
  };

  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) schedule();
  });
  page.on('close', () => {
    closed = true;
    clearTimeout(timer);
  });
  if (screenKey(page.url())) schedule();
}
