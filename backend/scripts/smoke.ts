/**
 * Prueba de humo del grabador real: levanta una página local, la graba con Chromium
 * sin ventana y verifica eventos, ocultamiento de datos y video.
 *
 *   npm run smoke -w @rastro/backend
 */
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WebSocketServer } from 'ws';
import { createUseCases, RecordingRegistry } from '../src/application/index.js';
import { REDACTED } from '../src/domain/redaction/Redactor.js';
import type { Logger } from '../src/domain/ports.js';
import { FileAgentRunStore } from '../src/infrastructure/persistence/FileAgentRunStore.js';
import { FileEventStore } from '../src/infrastructure/persistence/FileEventStore.js';
import { FileFindingDecisionStore } from '../src/infrastructure/persistence/FileFindingDecisionStore.js';
import { FileMediaStore } from '../src/infrastructure/persistence/FileMediaStore.js';
import { FileScreenshotStore } from '../src/infrastructure/persistence/FileScreenshotStore.js';
import { FileAgentSettingsStore } from '../src/infrastructure/persistence/FileAgentSettingsStore.js';
import { FileProjectRepository } from '../src/infrastructure/persistence/FileProjectRepository.js';
import { FileSessionReviewStore } from '../src/infrastructure/persistence/FileSessionReviewStore.js';
import { FileSessionRepository } from '../src/infrastructure/persistence/FileSessionRepository.js';
import { FileSessionStorageInspector } from '../src/infrastructure/persistence/FileSessionStorageInspector.js';
import { SessionPaths } from '../src/infrastructure/persistence/SessionPaths.js';
import { PlaywrightRecorder } from '../src/infrastructure/recording/playwright/PlaywrightRecorder.js';
import { FileReportStore } from '../src/infrastructure/reports/FileReportStore.js';
import { PlaywrightPdfRenderer } from '../src/infrastructure/reports/PlaywrightPdfRenderer.js';
import { CryptoIdGenerator, SystemClock } from '../src/infrastructure/system/system.js';

const PAGE = `<!doctype html>
<html lang="es"><body>
  <img src="/logo.png" width="40" height="40">
  <label>Tarjeta <input id="card" name="card"></label>
  <button id="pay">Confirmar pago</button>
  <script>
    const ws = new WebSocket('ws://' + location.host + '/ws');
    ws.onmessage = (event) => console.log('ws recibió', event.data);
    document.getElementById('pay').addEventListener('click', async () => {
      const response = await fetch('/api/orders?access_token=secreto', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: 'Bearer abc' },
        body: JSON.stringify({ cardNumber: '4242424242424242', amount: 47470 }),
      });
      console.error('El pedido falló con status', response.status);
      ws.send(JSON.stringify({ type: 'order.status', status: 'failed' }));
    });
    setTimeout(() => document.getElementById('pay').click(), 800);
  </script>
</body></html>`;

const log = (line: string) => process.stdout.write(`${line}\n`);
const quietLogger: Logger = { debug: () => {}, info: () => {}, warn: (m) => log(`  warn: ${m}`), error: (m) => log(`  error: ${m}`) };

async function main(): Promise<void> {
  const server = createServer((request, response) => {
    if (request.method === 'POST' && request.url?.startsWith('/api/orders')) {
      response.writeHead(500, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: 'PAYMENT_CAPTURE_TIMEOUT', orderId: null }));
      return;
    }
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(PAGE);
  });
  const wss = new WebSocketServer({ server, path: '/ws' });
  wss.on('connection', (socket) => socket.on('message', (data) => socket.send(`eco: ${data.toString()}`)));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;

  const dataDir = await mkdtemp(join(tmpdir(), 'rastro-smoke-'));
  const paths = new SessionPaths(dataDir);
  const registry = new RecordingRegistry(1);
  const useCases = createUseCases({
    sessions: new FileSessionRepository(paths, quietLogger),
    events: new FileEventStore(paths, quietLogger),
    media: new FileMediaStore(paths),
    screenshots: new FileScreenshotStore(paths),
    decisions: new FileFindingDecisionStore(paths),
    reviews: new FileSessionReviewStore(paths),
    renderer: new PlaywrightPdfRenderer(),
    reportStore: new FileReportStore(join(dataDir, 'informes')),
    opener: { open: async () => {}, reveal: async () => {} },
    // La prueba de humo no llama a ningún modelo de IA: los agentes quedan desactivados.
    agentModel: null,
    agentModelName: 'gemini-2.5-pro',
    agentProvider: 'Google Gemini',
    agentRuns: new FileAgentRunStore(paths),
    storage: new FileSessionStorageInspector(paths),
    projects: new FileProjectRepository(join(dataDir, 'projects.json')),
    agentSettings: new FileAgentSettingsStore(join(dataDir, 'agent-settings.json')),
    envPath: join(dataDir, '.env'),
    clock: new SystemClock(),
    ids: new CryptoIdGenerator(),
    notifier: { publish: () => {} },
    logger: quietLogger,
    registry,
    recorder: new PlaywrightRecorder({ videoSize: { width: 1280, height: 720 }, maxBodyBytes: 65_536, headless: true, logger: quietLogger }),
  });

  let failures = 0;
  const check = (ok: boolean, label: string) => {
    log(`${ok ? '  ✔' : '  ✘'} ${label}`);
    if (!ok) failures += 1;
  };

  try {
    const session = await useCases.createSession.execute({
      objective: {
        sessionName: 'Prueba de humo',
        statement: 'Comprobar que el grabador captura la sesión completa.',
        testType: 'funcional',
        criteria: [{ id: 'CA1', text: 'Se capturan red, sockets, consola y acciones.' }],
        scope: { include: [], exclude: [] },
      },
      capture: {
        startUrl: `http://127.0.0.1:${port}/`,
        environment: 'DEV',
        channels: ['actions', 'network', 'websocket', 'console', 'performance', 'accessibility', 'video', 'screenshots'],
        redaction: { presets: ['card-numbers', 'tokens-cookies', 'emails'], customPatterns: [] },
        analysisMode: 'none',
      },
    });
    log(`Grabando ${session.id} contra http://127.0.0.1:${port}/ …`);
    await useCases.startRecording.execute(session.id);
    // La revisión de accesibilidad espera 2 s a que la pantalla se asiente y luego corre axe-core.
    await new Promise((resolve) => setTimeout(resolve, 5500));
    // El QA marca un momento como evidencia mientras graba.
    await useCases.addMarker.execute(session.id, { criterionId: 'CA1', note: 'Aparece el error del pago' });
    const done = await useCases.stopRecording.execute(session.id);
    await useCases.setCriterionVerdict.execute(session.id, 'CA1', { verdict: 'fail', note: 'El pago devuelve 500' });
    const events = await useCases.getSessionEvents.execute(session.id);

    const byKind = new Map<string, number>();
    for (const event of events) byKind.set(event.kind, (byKind.get(event.kind) ?? 0) + 1);
    log(`Estado: ${done.status} · ${events.length} eventos`);
    log(`Por tipo: ${[...byKind].map(([kind, count]) => `${kind}=${count}`).join(', ')}`);

    const order = events.find((event) => event.kind === 'http-request' && event.method === 'POST');
    const orderResponse = events.find((event) => event.kind === 'http-response' && event.status === 500);
    const click = events.find((event) => event.kind === 'user-action' && event.action === 'click');

    check(done.status === 'completed', 'la sesión terminó como completada');
    check(
      events.some((event) => event.kind === 'http-request' && event.resourceType === 'Document'),
      'se capturó la carga inicial del documento',
    );
    check(Boolean(click), 'se capturó el click del usuario');
    check(click?.kind === 'user-action' && Boolean(click.rect), 'el click trae su rectángulo (para overlays)');
    check(Boolean(order), 'se capturó el POST /api/orders');
    check(order?.kind === 'http-request' && !order.url.includes('secreto'), 'el token de la URL quedó oculto');
    check(order?.kind === 'http-request' && order.headers.authorization === REDACTED, 'el header Authorization quedó oculto');
    check(order?.kind === 'http-request' && (order.postData ?? '').includes(REDACTED), 'el número de tarjeta quedó oculto');
    check(orderResponse?.kind === 'http-response' && (orderResponse.body ?? '').includes('PAYMENT_CAPTURE_TIMEOUT'), 'se guardó el cuerpo de la respuesta 500');
    check((byKind.get('ws-frame') ?? 0) >= 2, 'se capturaron frames de WebSocket (enviado y recibido)');
    check(events.some((event) => event.kind === 'console' && event.level === 'error'), 'se capturó el console.error');
    const a11y = events.find((event) => event.kind === 'a11y-scan');
    const imageAlt = a11y?.kind === 'a11y-scan' ? a11y.violations.find((item) => item.id === 'image-alt') : undefined;
    check(Boolean(a11y), 'se revisó la accesibilidad de la pantalla');
    check(
      a11y?.kind === 'a11y-scan' && Boolean(a11y.viewport?.w) && a11y.violations.some((item) => item.nodes.some((node) => node.rect)),
      'la revisión trae el tamaño de la ventana y los rectángulos (para los recuadros)',
    );
    check(click?.kind === 'user-action' && typeof click.viewport.dpr === 'number', 'la acción trae el zoom de pantalla (devicePixelRatio)');
    check(Boolean(imageAlt), 'axe-core detectó la imagen sin texto alternativo');
    if (imageAlt) log(`    «${imageAlt.help}»`);
    const screenshot = events.find((event) => event.kind === 'screenshot');
    check(Boolean(screenshot), 'se capturó una screenshot de la pantalla');
    if (screenshot?.kind === 'screenshot') {
      const { size } = await stat(paths.screenshotFile(session.id, screenshot.file));
      check(size > 0, `la screenshot pesa ${Math.round(size / 1024)} KB`);
    }
    const analysis = await useCases.analyzeSession.execute(session.id);
    check(analysis.findings.some((finding) => finding.ruleId === 'a11y-violation'), 'el análisis generó el hallazgo de accesibilidad');
    const review = await useCases.getSessionReview.execute(session.id);
    const [marker] = review.markers;
    check(Boolean(marker && marker.t > 5000 && marker.criterionId === 'CA1'), `la marca del QA quedó en el reloj de la sesión (${marker?.t ?? '?'} ms)`);
    check(review.criteria['CA1']?.verdict === 'fail', 'se guardó el veredicto del criterio CA1');
    const report = await useCases.exportSessionReport.execute(session.id);
    const pdf = await readFile(report.path);
    check(pdf.subarray(0, 5).toString('latin1') === '%PDF-', `se exportó el informe PDF (${Math.round(pdf.length / 1024)} KB, ${report.findings} hallazgos)`);
    check(done.hasVideo, 'la sesión tiene video');
    if (done.hasVideo) {
      const { size } = await stat(paths.videoFile(session.id));
      check(size > 1000, `el video pesa ${Math.round(size / 1024)} KB`);
    }
  } finally {
    await registry.stopAll();
    wss.close();
    server.close();
    await rm(dataDir, { recursive: true, force: true });
  }

  log(failures === 0 ? '\nPrueba de humo OK' : `\nPrueba de humo con ${failures} fallo(s)`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error: unknown) => {
  process.stderr.write(`La prueba de humo no pudo correr: ${error instanceof Error ? error.stack : String(error)}\n`);
  process.exit(1);
});
