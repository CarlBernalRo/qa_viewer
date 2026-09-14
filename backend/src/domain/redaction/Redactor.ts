import type { RawCaptureEvent, RedactionPreset } from '@rastro/shared';

export const REDACTED = '[oculto]';

export interface RedactionPolicy {
  presets: readonly RedactionPreset[];
  customPatterns: readonly string[];
}

const SENSITIVE_HEADERS = new Set([
  'authorization',
  'proxy-authorization',
  'x-api-key',
  'x-auth-token',
  'x-csrf-token',
]);

/** "sid=abc; theme=dark" → "sid=[oculto]; theme=[oculto]": se ocultan los valores, no los nombres. */
function redactCookieHeader(value: string): string {
  return value
    .split(';')
    .map((part) => {
      const equals = part.indexOf('=');
      return equals < 0 ? part : `${part.slice(0, equals)}=${REDACTED}`;
    })
    .join(';');
}

/**
 * "sid=abc; Path=/; Secure" → "sid=[oculto]; Path=/; Secure". Los atributos no son
 * secretos y las reglas de seguridad los necesitan (Secure, HttpOnly, SameSite).
 */
function redactSetCookie(value: string): string {
  return value
    .split('\n')
    .map((line) => {
      const [pair = '', ...attributes] = line.split(';');
      const equals = pair.indexOf('=');
      const name = equals < 0 ? pair : pair.slice(0, equals);
      return [`${name.trim()}=${REDACTED}`, ...attributes].join(';');
    })
    .join('\n');
}
const SENSITIVE_PARAM = /token|auth|secret|password|passwd|session|signature|sig|api[-_]?key|code/i;
const SENSITIVE_KEY_TOKENS = /^(password|passwd|pwd|secret|token|access_?token|refresh_?token|id_?token|authorization|api_?key|session_?id)$/i;
const SENSITIVE_KEY_CARDS = /^(card_?number|cardnumber|pan|cvv|cvc|security_?code|expiry|exp_?(month|year|date))$/i;

const CARD_CANDIDATE = /\b(?:\d[ -]?){12,18}\d\b/g;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
// DNI con puntos (12.345.678) y teléfonos con prefijo internacional.
const NATIONAL_ID = /\b\d{1,2}\.\d{3}\.\d{3}\b|\+\d{1,3}[\s-]?\(?\d{1,4}\)?[\s-]?\d{3,4}[\s-]?\d{3,4}\b/g;

function passesLuhn(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let d = Number(digits[i]);
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

function compileCustom(patterns: readonly string[]): RegExp[] {
  const compiled: RegExp[] = [];
  for (const pattern of patterns) {
    try {
      compiled.push(new RegExp(pattern, 'g'));
    } catch {
      // Un patrón inválido se ignora: la validación de entrada ya avisó al usuario.
    }
  }
  return compiled;
}

/**
 * Política de ocultamiento de datos sensibles. Se aplica a cada evento antes de
 * guardarlo, de modo que nada sensible llega al disco ni a futuros agentes.
 */
export class Redactor {
  private readonly presets: ReadonlySet<RedactionPreset>;
  private readonly custom: RegExp[];

  constructor(policy: RedactionPolicy) {
    this.presets = new Set(policy.presets);
    this.custom = compileCustom(policy.customPatterns);
  }

  redactText(text: string): string {
    let out = text;
    if (this.presets.has('card-numbers')) {
      out = out.replace(CARD_CANDIDATE, (match) => {
        const digits = match.replace(/\D/g, '');
        return digits.length >= 13 && passesLuhn(digits) ? REDACTED : match;
      });
    }
    if (this.presets.has('emails')) out = out.replace(EMAIL, REDACTED);
    if (this.presets.has('national-ids')) out = out.replace(NATIONAL_ID, REDACTED);
    for (const regex of this.custom) out = out.replace(regex, REDACTED);
    return out;
  }

  redactHeaders(headers: Record<string, string>): Record<string, string> {
    const out: Record<string, string> = {};
    const tokens = this.presets.has('tokens-cookies');
    for (const [name, value] of Object.entries(headers)) {
      const lower = name.toLowerCase();
      if (tokens && lower === 'set-cookie') out[name] = redactSetCookie(value);
      else if (tokens && lower === 'cookie') out[name] = redactCookieHeader(value);
      else if (tokens && SENSITIVE_HEADERS.has(lower)) out[name] = REDACTED;
      else out[name] = this.redactText(value);
    }
    return out;
  }

  redactUrl(rawUrl: string): string {
    let url: URL;
    try {
      url = new URL(rawUrl);
    } catch {
      return this.redactText(rawUrl);
    }
    for (const [key, value] of [...url.searchParams.entries()]) {
      const hide = this.presets.has('tokens-cookies') && SENSITIVE_PARAM.test(key);
      url.searchParams.set(key, hide ? REDACTED : this.redactText(value));
    }
    return url.toString();
  }

  redactBody(body: string): string {
    const trimmed = body.trimStart();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        return JSON.stringify(this.redactJson(JSON.parse(body)));
      } catch {
        // No era JSON válido: se trata como texto.
      }
    }
    return this.redactText(body);
  }

  redactEvent(event: RawCaptureEvent): RawCaptureEvent {
    switch (event.kind) {
      case 'navigation':
        return { ...event, url: this.redactUrl(event.url) };
      case 'user-action':
        return {
          ...event,
          ...(event.value !== undefined ? { value: this.redactText(event.value) } : {}),
          ...(event.label !== undefined ? { label: this.redactText(event.label) } : {}),
        };
      case 'http-request':
        return {
          ...event,
          url: this.redactUrl(event.url),
          headers: this.redactHeaders(event.headers),
          ...(event.postData !== undefined ? { postData: this.redactBody(event.postData) } : {}),
        };
      case 'http-response':
        return {
          ...event,
          headers: this.redactHeaders(event.headers),
          ...(event.body !== undefined ? { body: this.redactBody(event.body) } : {}),
        };
      case 'ws-open':
        return { ...event, url: this.redactUrl(event.url) };
      case 'ws-frame':
        return { ...event, payload: this.redactBody(event.payload) };
      case 'sse-message':
        return { ...event, data: this.redactBody(event.data) };
      case 'console':
        return { ...event, text: this.redactText(event.text) };
      case 'exception':
        return {
          ...event,
          message: this.redactText(event.message),
          ...(event.stack !== undefined ? { stack: this.redactText(event.stack) } : {}),
        };
      case 'a11y-scan':
        // El HTML de los elementos afectados puede traer datos de la pantalla (emails, DNI…).
        return {
          ...event,
          url: this.redactUrl(event.url),
          violations: event.violations.map((violation) => ({
            ...violation,
            nodes: violation.nodes.map((node) => ({
              ...node,
              target: this.redactText(node.target),
              html: this.redactText(node.html),
              ...(node.summary !== undefined ? { summary: this.redactText(node.summary) } : {}),
            })),
          })),
        };
      default:
        return event;
    }
  }

  private redactJson(value: unknown): unknown {
    if (typeof value === 'string') return this.redactText(value);
    if (Array.isArray(value)) return value.map((item) => this.redactJson(item));
    if (value && typeof value === 'object') {
      const out: Record<string, unknown> = {};
      for (const [key, inner] of Object.entries(value)) {
        const hide =
          (this.presets.has('tokens-cookies') && SENSITIVE_KEY_TOKENS.test(key)) ||
          (this.presets.has('card-numbers') && SENSITIVE_KEY_CARDS.test(key));
        out[key] = hide ? REDACTED : this.redactJson(inner);
      }
      return out;
    }
    return value;
  }
}
