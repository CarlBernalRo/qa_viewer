import { join } from 'node:path';
import type { RawCaptureEvent } from '@rastro/shared';
import { chromium, type BrowserContext, type Page } from 'playwright';
import { z } from 'zod';
import type {
  BrowserRecorder,
  Logger,
  RecordingEndReason,
  RecordingHandle,
  RecordingSink,
  StartRecordingOptions,
} from '../../../domain/ports.js';
import { attachAccessibilityScanner } from './a11yScanner.js';
import { attachConsoleCollector, attachNetworkCollector } from './cdpCollectors.js';
import { pageInstrumentation } from './pageInstrumentation.js';

export interface PlaywrightRecorderOptions {
  videoSize: { width: number; height: number };
  maxBodyBytes: number;
  headless: boolean;
  logger: Logger;
}

/**
 * Lo que envía el script inyectado. La página grabada no es de confianza:
 * cualquier sitio podría llamar a `__rastroEmit`, así que todo se valida y se acota.
 */
const pageMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('action'),
    action: z.enum(['click', 'input', 'change', 'submit', 'keydown']),
    selector: z.string().max(500),
    label: z.string().max(200).optional(),
    value: z.string().max(500).optional(),
    key: z.string().max(30).optional(),
    rect: z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() }).optional(),
    viewport: z.object({ w: z.number(), h: z.number(), dpr: z.number().positive().max(10).optional() }),
  }),
  z.object({
    type: z.literal('vital'),
    name: z.enum(['LCP', 'CLS', 'INP', 'long-task']),
    value: z.number().finite(),
  }),
]);

/**
 * Arma el script que se inyecta en cada página. Al transpilar en desarrollo, tsx
 * (esbuild) agrega llamadas a `__name` dentro de las funciones; como la página no
 * tiene ese helper, se define uno local que no hace nada. Así el mismo código
 * funciona en desarrollo y en producción.
 */
function buildInitScript(options: Parameters<typeof pageInstrumentation>[0]): string {
  return `(() => { const __name = (fn) => fn; (${pageInstrumentation.toString()})(${JSON.stringify(options)}); })();`;
}

export class PlaywrightRecorder implements BrowserRecorder {
  constructor(private readonly options: PlaywrightRecorderOptions) {}

  async start(
    { sessionId, config, videoDir }: StartRecordingOptions,
    sink: RecordingSink,
  ): Promise<RecordingHandle> {
    const { videoSize, maxBodyBytes, headless, logger } = this.options;
    const channels = new Set(config.channels);
    const emit = (event: RawCaptureEvent): void => sink.onEvent(event);
    const onError = (message: string, error: unknown): void =>
      logger.warn(message, { sessionId, error: String(error) });

    // Con ventana: maximizada y sin viewport fijo, así la página ocupa toda la ventana
    // y responde al redimensionarla, como un navegador normal.
    const browser = await chromium.launch({ headless, args: headless ? [] : ['--start-maximized'] });
    let context: BrowserContext;
    try {
      context = await browser.newContext({
        viewport: headless ? videoSize : null,
        ...(channels.has('video') ? { recordVideo: { dir: videoDir, size: videoSize } } : {}),
      });
    } catch (error) {
      await browser.close().catch(() => undefined);
      throw error;
    }

    const pageIds = new Map<Page, string>();

    if (channels.has('actions') || channels.has('performance')) {
      await context.exposeBinding('__rastroEmit', ({ page }, payload: unknown) => {
        const pageId = pageIds.get(page);
        const parsed = pageMessageSchema.safeParse(payload);
        if (!pageId || !parsed.success) return;
        const message = parsed.data;
        if (message.type === 'action' && channels.has('actions')) {
          emit({
            kind: 'user-action',
            pageId,
            action: message.action,
            selector: message.selector,
            viewport: message.viewport,
            ...(message.label !== undefined ? { label: message.label } : {}),
            ...(message.value !== undefined ? { value: message.value } : {}),
            ...(message.key !== undefined ? { key: message.key } : {}),
            ...(message.rect ? { rect: message.rect } : {}),
          });
        } else if (message.type === 'vital' && channels.has('performance')) {
          emit({ kind: 'web-vital', pageId, name: message.name, value: message.value });
        }
      });
      await context.addInitScript({
        content: buildInitScript({
          actions: channels.has('actions'),
          performance: channels.has('performance'),
        }),
      });
    }

    // La pestaña principal llega por dos caminos (el evento 'page' y la llamada directa):
    // ambos esperan la misma instrumentación, así nadie navega antes de que los colectores
    // estén conectados. Si no, se perdían la carga inicial del documento y sus recursos.
    const instrumenting = new Map<Page, Promise<void>>();
    const instrument = (page: Page): Promise<void> => {
      const existing = instrumenting.get(page);
      if (existing) return existing;
      const pageId = `p${pageIds.size + 1}`;
      pageIds.set(page, pageId);
      if (channels.has('actions')) {
        page.on('framenavigated', (frame) => {
          if (frame === page.mainFrame()) emit({ kind: 'navigation', pageId, url: frame.url() });
        });
      }
      const ready = (async () => {
        try {
          const cdp = await context.newCDPSession(page);
          const collectorOptions = { pageId, channels, maxBodyBytes, emit, onError };
          await attachNetworkCollector(cdp, collectorOptions);
          await attachConsoleCollector(cdp, collectorOptions);
          if (channels.has('accessibility')) attachAccessibilityScanner(page, cdp, { pageId, emit, onError });
        } catch (error) {
          onError('No se pudo instrumentar una pestaña', error);
        }
      })();
      instrumenting.set(page, ready);
      return ready;
    };

    context.on('page', (page) => void instrument(page));
    const mainPage = await context.newPage();
    // Playwright empieza a grabar el video al crear la página: ese es el cero del video.
    if (channels.has('video')) sink.onVideoStarted();
    await instrument(mainPage);

    let stopping = false;
    let finishing: Promise<void> | null = null;
    const finish = (reason: RecordingEndReason, error?: string): Promise<void> => {
      finishing ??= (async () => {
        const video = mainPage.video();
        await context.close().catch(() => undefined);
        // saveAs espera a que el video termine de escribirse. Con video.path() el archivo
        // podía seguir abierto (EBUSY en Windows) cuando el usuario cierra la ventana.
        let videoFile: string | undefined;
        if (video) {
          const target = join(videoDir, 'final.webm');
          try {
            await video.saveAs(target);
            videoFile = target;
          } catch (saveError) {
            onError('No se pudo terminar de guardar el video', saveError);
            videoFile = await video.path().catch(() => undefined);
          }
        }
        await browser.close().catch(() => undefined);
        sink.onEnded({
          reason,
          ...(videoFile ? { videoFile } : {}),
          ...(error ? { error } : {}),
        });
      })();
      return finishing;
    };

    // Cerrar la pestaña principal o la ventana termina la grabación.
    mainPage.on('close', () => void finish(stopping ? 'stopped' : 'browser-closed'));
    mainPage.on('crash', () => void finish('crashed', 'La página se bloqueó durante la grabación.'));
    browser.on('disconnected', () => void finish(stopping ? 'stopped' : 'browser-closed'));

    mainPage.goto(config.startUrl, { waitUntil: 'commit' }).catch((error: unknown) => {
      if (finishing) return;
      const reason = error instanceof Error ? error.message.split('\n')[0] : String(error);
      emit({ kind: 'exception', pageId: 'p1', message: `No se pudo abrir ${config.startUrl}: ${reason}` });
    });

    return {
      stop: async () => {
        stopping = true;
        await finish('stopped');
      },
    };
  }
}
