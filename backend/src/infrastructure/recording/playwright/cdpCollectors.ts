import type { CaptureChannel, RawCaptureEvent } from '@rastro/shared';
import type { CDPSession } from 'playwright';

export interface CollectorOptions {
  pageId: string;
  channels: ReadonlySet<CaptureChannel>;
  maxBodyBytes: number;
  emit: (event: RawCaptureEvent) => void;
  onError: (message: string, error: unknown) => void;
}

/** Tipos de recurso cuyo cuerpo vale la pena guardar (no imágenes, CSS ni scripts). */
const BODY_RESOURCE_TYPES = new Set(['XHR', 'Fetch', 'Document', 'EventSource']);
const TEXT_MIME = /json|text\/plain|text\/html|xml|x-www-form-urlencoded|graphql/i;

function truncate(text: string, max: number): { text: string; truncated: boolean } {
  return text.length > max ? { text: text.slice(0, max), truncated: true } : { text, truncated: false };
}

function toHeaderRecord(headers: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) out[name] = String(value);
  return out;
}

interface PendingResponse {
  status: number;
  statusText: string;
  mimeType: string;
  headers: Record<string, string>;
  resourceType: string;
}

export async function attachNetworkCollector(cdp: CDPSession, options: CollectorOptions): Promise<void> {
  const { pageId, channels, maxBodyBytes, emit, onError } = options;
  const wantsHttp = channels.has('network');
  const wantsSockets = channels.has('websocket');
  if (!wantsHttp && !wantsSockets) return;

  await cdp.send('Network.enable', { maxPostDataSize: maxBodyBytes });

  if (wantsHttp) {
    const startedAt = new Map<string, number>();
    const responses = new Map<string, PendingResponse>();

    const emitResponse = (requestId: string, response: PendingResponse, body?: { text: string; truncated: boolean }) => {
      emit({
        kind: 'http-response',
        pageId,
        requestId,
        status: response.status,
        statusText: response.statusText,
        mimeType: response.mimeType,
        headers: response.headers,
        ...(body ? { body: body.text, bodyTruncated: body.truncated } : {}),
      });
    };

    cdp.on('Network.requestWillBeSent', (params) => {
      if (params.redirectResponse) {
        emitResponse(params.requestId, {
          status: params.redirectResponse.status,
          statusText: params.redirectResponse.statusText,
          mimeType: params.redirectResponse.mimeType,
          headers: toHeaderRecord(params.redirectResponse.headers),
          resourceType: params.type ?? 'Other',
        });
      }
      startedAt.set(params.requestId, params.timestamp);
      const postData = params.request.postData;
      emit({
        kind: 'http-request',
        pageId,
        requestId: params.requestId,
        method: params.request.method,
        url: params.request.url,
        resourceType: params.type ?? 'Other',
        headers: toHeaderRecord(params.request.headers),
        ...(postData ? { postData: truncate(postData, maxBodyBytes).text } : {}),
      });
    });

    cdp.on('Network.responseReceived', (params) => {
      responses.set(params.requestId, {
        status: params.response.status,
        statusText: params.response.statusText,
        mimeType: params.response.mimeType,
        headers: toHeaderRecord(params.response.headers),
        resourceType: params.type,
      });
    });

    cdp.on('Network.loadingFinished', (params) => {
      const response = responses.get(params.requestId);
      const start = startedAt.get(params.requestId);
      responses.delete(params.requestId);
      startedAt.delete(params.requestId);
      void (async () => {
        if (response) {
          let body: { text: string; truncated: boolean } | undefined;
          const wantsBody =
            maxBodyBytes > 0 &&
            BODY_RESOURCE_TYPES.has(response.resourceType) &&
            TEXT_MIME.test(response.mimeType);
          if (wantsBody) {
            try {
              const result = await cdp.send('Network.getResponseBody', { requestId: params.requestId });
              if (!result.base64Encoded) body = truncate(result.body, maxBodyBytes);
            } catch {
              // El navegador ya liberó el cuerpo (p. ej., al navegar): se guarda sin cuerpo.
            }
          }
          emitResponse(params.requestId, response, body);
        }
        emit({
          kind: 'http-finished',
          pageId,
          requestId: params.requestId,
          encodedDataLength: params.encodedDataLength,
          durationMs: start !== undefined ? Math.round((params.timestamp - start) * 1000) : 0,
        });
      })().catch((error: unknown) => onError('Error al procesar una respuesta', error));
    });

    cdp.on('Network.loadingFailed', (params) => {
      const response = responses.get(params.requestId);
      responses.delete(params.requestId);
      startedAt.delete(params.requestId);
      if (response) emitResponse(params.requestId, response);
      emit({
        kind: 'http-failed',
        pageId,
        requestId: params.requestId,
        errorText: params.errorText,
        canceled: params.canceled ?? false,
      });
    });
  }

  if (wantsSockets) {
    const framePayload = (opcode: number, payload: string) => {
      if (opcode === 2) {
        return { payload: `[binario · ${Math.round(payload.length * 0.75)} bytes]`, truncated: false };
      }
      const result = truncate(payload, maxBodyBytes);
      return { payload: result.text, truncated: result.truncated };
    };

    cdp.on('Network.webSocketCreated', (params) => {
      emit({ kind: 'ws-open', pageId, requestId: params.requestId, url: params.url });
    });
    cdp.on('Network.webSocketFrameSent', (params) => {
      emit({
        kind: 'ws-frame',
        pageId,
        requestId: params.requestId,
        direction: 'sent',
        opcode: params.response.opcode,
        ...framePayload(params.response.opcode, params.response.payloadData),
      });
    });
    cdp.on('Network.webSocketFrameReceived', (params) => {
      emit({
        kind: 'ws-frame',
        pageId,
        requestId: params.requestId,
        direction: 'received',
        opcode: params.response.opcode,
        ...framePayload(params.response.opcode, params.response.payloadData),
      });
    });
    cdp.on('Network.webSocketClosed', (params) => {
      emit({ kind: 'ws-close', pageId, requestId: params.requestId });
    });
    cdp.on('Network.eventSourceMessageReceived', (params) => {
      emit({
        kind: 'sse-message',
        pageId,
        requestId: params.requestId,
        eventName: params.eventName,
        data: truncate(params.data, maxBodyBytes).text,
      });
    });
  }
}

const CONSOLE_LEVELS: Record<string, 'debug' | 'log' | 'info' | 'warn' | 'error'> = {
  debug: 'debug',
  log: 'log',
  info: 'info',
  warning: 'warn',
  warn: 'warn',
  error: 'error',
  assert: 'error',
  trace: 'debug',
};

export async function attachConsoleCollector(cdp: CDPSession, options: CollectorOptions): Promise<void> {
  const { pageId, channels, emit } = options;
  if (!channels.has('console')) return;

  await cdp.send('Runtime.enable');
  await cdp.send('Log.enable');

  cdp.on('Runtime.consoleAPICalled', (params) => {
    const text = params.args
      .map((arg) => {
        if (arg.value !== undefined) return typeof arg.value === 'string' ? arg.value : JSON.stringify(arg.value);
        return arg.unserializableValue ?? arg.description ?? `[${arg.type}]`;
      })
      .join(' ');
    const frame = params.stackTrace?.callFrames[0];
    emit({
      kind: 'console',
      pageId,
      level: CONSOLE_LEVELS[params.type] ?? 'log',
      text: truncate(text, 4000).text,
      ...(frame ? { source: `${frame.url}:${frame.lineNumber + 1}` } : {}),
    });
  });

  cdp.on('Runtime.exceptionThrown', (params) => {
    const details = params.exceptionDetails;
    const description = details.exception?.description;
    emit({
      kind: 'exception',
      pageId,
      message: (description?.split('\n')[0] ?? details.text).slice(0, 1000),
      ...(description ? { stack: truncate(description, 8000).text } : {}),
    });
  });

  // Errores del navegador que no pasan por console (CSP, violaciones, etc.).
  // "network" ya se registra como http-failed y "javascript" como exception.
  cdp.on('Log.entryAdded', (params) => {
    const { entry } = params;
    if (entry.source === 'network' || entry.source === 'javascript') return;
    if (entry.level !== 'error' && entry.level !== 'warning') return;
    emit({
      kind: 'console',
      pageId,
      level: entry.level === 'error' ? 'error' : 'warn',
      text: truncate(entry.text, 4000).text,
      ...(entry.url ? { source: entry.url } : {}),
    });
  });
}
