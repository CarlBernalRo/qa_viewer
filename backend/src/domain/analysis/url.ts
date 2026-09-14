/** Utilidades de URL para las reglas: a qué sitio pertenece, ruta normalizada y alcance del objetivo. */

const SECOND_LEVEL = new Set(['com', 'edu', 'gov', 'gob', 'org', 'net', 'co', 'ac', 'mil', 'nom']);
const ID_SEGMENT =
  /^(\d+|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-f]{16,}|[A-Za-z0-9_-]{24,})$/i;

export function safeUrl(raw: string): URL | null {
  try {
    return new URL(raw);
  } catch {
    return null;
  }
}

/** "app.qa.mercadito.com.ar" → "mercadito.com.ar". Es aproximado: no usa la lista pública de sufijos. */
export function siteOf(hostname: string): string {
  if (/^[\d.]+$/.test(hostname) || hostname.startsWith('[')) return hostname;
  const labels = hostname.split('.');
  if (labels.length <= 2) return hostname;
  const last = labels[labels.length - 1] ?? '';
  const second = labels[labels.length - 2] ?? '';
  const take = last.length === 2 && SECOND_LEVEL.has(second) ? 3 : 2;
  return labels.slice(-take).join('.');
}

export function isLocalHost(hostname: string): boolean {
  return (
    hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.startsWith('127.') || hostname === '[::1]'
  );
}

/** "/api/orders/8812/items" → "/api/orders/:id/items", para agrupar llamadas al mismo endpoint. */
export function normalizedPath(url: URL): string {
  const path = url.pathname
    .split('/')
    .map((segment) => (ID_SEGMENT.test(segment) ? ':id' : segment))
    .join('/');
  return path || '/';
}

const escapeRegex = (text: string) => text.replace(/[.+?^${}()|[\]\\]/g, '\\$&');

/** Un ítem del alcance ("/api/recommendations", "/checkout/*") aparece en la URL. */
export function matchesScope(url: string, pattern: string): boolean {
  const normalized = pattern.trim().toLowerCase();
  if (!normalized) return false;
  const target = url.toLowerCase();
  if (!normalized.includes('*')) return target.includes(normalized);
  return new RegExp(normalized.split('*').map(escapeRegex).join('.*')).test(target);
}
