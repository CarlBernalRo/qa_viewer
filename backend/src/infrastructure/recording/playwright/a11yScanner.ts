import { readFile } from 'node:fs/promises';
import { A11Y_RULES_ES, a11yViolationSchema, cleanAxeText, type RawCaptureEvent } from '@rastro/shared';
import type { CDPSession, Page } from 'playwright';
import { z } from 'zod';

export interface AccessibilityScannerOptions {
  pageId: string;
  emit: (event: RawCaptureEvent) => void;
  onError: (message: string, error: unknown) => void;
  /** Espera tras navegar, para que la pantalla termine de dibujarse. */
  settleMs?: number;
  /** Tope de pantallas revisadas por pestaña. */
  maxScans?: number;
}

const SCAN_TIMEOUT_MS = 15_000;
const MAX_NODES = 10;

/** Lo que devuelve la revisión. Viene de la página grabada, así que se valida y se acota. */
const scanOutputSchema = z.object({
  url: z.string().max(4000),
  passes: z.number().int().nonnegative(),
  violations: z.array(a11yViolationSchema).max(200),
});

interface AxeBundle {
  source: string;
  locale: unknown;
}

let bundle: AxeBundle | null = null;

/** axe-core pesa unos 500 KB: se carga la primera vez que hace falta, con sus textos en español. */
async function loadAxe(): Promise<AxeBundle> {
  if (bundle) return bundle;
  const { default: axe } = await import('axe-core');
  const localeUrl = new URL('./locales/es.json', import.meta.resolve('axe-core'));
  const locale = JSON.parse(await readFile(localeUrl, 'utf8')) as { rules?: Record<string, unknown> };
  // La traducción de axe no trae todas las reglas: se completan las que faltan.
  locale.rules = { ...locale.rules, ...A11Y_RULES_ES };
  bundle = { source: axe.source, locale };
  return bundle;
}

/** Script que corre dentro de la página (en un mundo aislado) y devuelve el resultado como JSON. */
function scanExpression(locale: unknown): string {
  return `(async () => {
    axe.configure({ locale: ${JSON.stringify(locale)} });
    const results = await axe.run(document, {
      resultTypes: ['violations'],
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] },
      rules: { region: { enabled: false } },
    });
    const rectOf = (target) => {
      if (typeof target !== 'string') return undefined;
      try {
        const box = document.querySelector(target)?.getBoundingClientRect();
        return box ? { x: Math.round(box.x), y: Math.round(box.y), w: Math.round(box.width), h: Math.round(box.height) } : undefined;
      } catch {
        return undefined;
      }
    };
    return JSON.stringify({
      url: location.href,
      passes: results.passes.length,
      violations: results.violations.map((violation) => ({
        id: violation.id,
        impact: violation.impact ?? null,
        help: String(violation.help).slice(0, 500),
        description: String(violation.description).slice(0, 1000),
        helpUrl: String(violation.helpUrl).slice(0, 500),
        tags: violation.tags.slice(0, 40),
        nodeCount: violation.nodes.length,
        nodes: violation.nodes.slice(0, ${MAX_NODES}).map((node) => ({
          target: node.target.map(String).join(' ').slice(0, 1000),
          html: String(node.html).slice(0, 300),
          summary: String(node.failureSummary ?? '').slice(0, 600),
          rect: rectOf(node.target[0]),
        })),
      })),
    });
  })()`;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`axe-core tardó más de ${ms / 1000} s`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/** Pantalla a revisar: sin query (mismos datos, otra búsqueda) pero con hash (rutas de SPA). */
function screenKey(raw: string): string | null {
  try {
    const url = new URL(raw);
    return url.protocol === 'http:' || url.protocol === 'https:' ? `${url.origin}${url.pathname}${url.hash}` : null;
  } catch {
    return null;
  }
}

/** Errores esperables: se navegó o se cerró la pestaña a mitad de la revisión. */
const INTERRUPTED = /context|destroyed|closed|navigat|detached/i;

/**
 * Revisa la accesibilidad de cada pantalla distinta con axe-core. Corre en un mundo
 * aislado (CDP): comparte el DOM con la página pero no su JavaScript, así que ni la
 * página ve a axe ni axe depende de lo que la página haga con sus globales.
 */
export function attachAccessibilityScanner(page: Page, cdp: CDPSession, options: AccessibilityScannerOptions): void {
  const { pageId, emit, onError, settleMs = 2000, maxScans = 25 } = options;
  const scanned = new Set<string>();
  let timer: NodeJS.Timeout | undefined;
  let running = false;
  let closed = false;

  const schedule = (): void => {
    clearTimeout(timer);
    timer = setTimeout(() => void scan(), settleMs);
  };

  const scan = async (): Promise<void> => {
    if (closed) return;
    if (running) {
      schedule();
      return;
    }
    const key = screenKey(page.url());
    if (!key || scanned.has(key) || scanned.size >= maxScans) return;
    running = true;
    scanned.add(key);
    const startedAt = Date.now();
    try {
      const axe = await loadAxe();
      const { frameTree } = await cdp.send('Page.getFrameTree');
      const { executionContextId } = await cdp.send('Page.createIsolatedWorld', {
        frameId: frameTree.frame.id,
        worldName: 'rastro-a11y',
      });
      await cdp.send('Runtime.evaluate', { expression: axe.source, contextId: executionContextId });
      const response = await withTimeout(
        cdp.send('Runtime.evaluate', {
          expression: scanExpression(axe.locale),
          contextId: executionContextId,
          awaitPromise: true,
          returnByValue: true,
        }),
        SCAN_TIMEOUT_MS,
      );
      if (response.exceptionDetails) {
        throw new Error(response.exceptionDetails.exception?.description ?? response.exceptionDetails.text);
      }
      const result = scanOutputSchema.parse(JSON.parse(String(response.result.value)));
      emit({
        kind: 'a11y-scan',
        pageId,
        url: result.url,
        durationMs: Date.now() - startedAt,
        passes: result.passes,
        violations: result.violations.map((violation) => ({
          ...violation,
          help: cleanAxeText(violation.help),
          description: cleanAxeText(violation.description),
          nodes: violation.nodes.map((node) => ({
            ...node,
            ...(node.summary !== undefined ? { summary: cleanAxeText(node.summary) } : {}),
          })),
        })),
      });
    } catch (error) {
      // Si se interrumpió, la pantalla queda pendiente y se revisa si el usuario vuelve a ella.
      scanned.delete(key);
      const message = error instanceof Error ? error.message : String(error);
      if (!closed && !INTERRUPTED.test(message)) onError('No se pudo revisar la accesibilidad de la pantalla', error);
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
  // Una pestaña que ya llegó con una página cargada (p. ej., un popup) se revisa sin esperar otra navegación.
  if (screenKey(page.url())) schedule();
}
