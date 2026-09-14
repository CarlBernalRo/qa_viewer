import type { CaptureEvent, FindingSeverity, RuleId } from '@rastro/shared';
import type { SessionEvidence } from './evidence.js';

/** Lo que devuelve una regla; el analizador le agrega id, tiempos, acción previa y alcance. */
export interface FindingDraft {
  severity: FindingSeverity;
  /** Agrupa: la misma regla con la misma clave produce un solo hallazgo. */
  key: string;
  title: string;
  subject?: string;
  detail: string;
  recommendation?: string;
  /** Eventos que lo prueban; el primero es el principal. */
  evidence: readonly CaptureEvent[];
  /** Si no se indica, es la cantidad de evidencias. */
  occurrences?: number;
  /** URLs involucradas, para saber si el hallazgo cae fuera del alcance del objetivo. */
  urls?: readonly string[];
}

export interface Rule {
  readonly id: RuleId;
  run(evidence: SessionEvidence): FindingDraft[];
}

const ONE_LEVEL_LOWER: Record<FindingSeverity, FindingSeverity> = {
  critical: 'high',
  high: 'medium',
  medium: 'low',
  low: 'low',
};

/** Un nivel menos de gravedad (p. ej., cuando el problema es de un tercero). */
export function downgrade(severity: FindingSeverity): FindingSeverity {
  return ONE_LEVEL_LOWER[severity];
}

export function groupBy<T>(items: Iterable<T>, keyOf: (item: T) => string | null): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    if (key === null) continue;
    const group = groups.get(key);
    if (group) group.push(item);
    else groups.set(key, [item]);
  }
  return groups;
}

export function distinct<T>(items: Iterable<T>): T[] {
  return [...new Set(items)];
}

export const times = (count: number): string => (count === 1 ? '1 vez' : `${count} veces`);

/** 850 → "850 ms"; 3240 → "3,2 s". */
export function formatMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(1).replace('.', ',')} s`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}

/** Texto en una línea y recortado con "…". */
export function clip(text: string, max = 90): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

export function parseJson(text: string | undefined): unknown {
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

const MESSAGE_KEYS = ['message', 'error', 'detail', 'title', 'reason', 'description', 'status_code'];

/** Mensajes legibles dentro de un JSON de error, p. ej. {"message": …, "data": {"message": …}}. */
export function messagesIn(value: unknown, depth = 0): string[] {
  if (depth > 2 || value === null || typeof value !== 'object') return [];
  if (Array.isArray(value)) return distinct(value.slice(0, 3).flatMap((item) => messagesIn(item, depth + 1)));
  const record = value as Record<string, unknown>;
  const found: string[] = [];
  for (const key of MESSAGE_KEYS) {
    const inner = record[key];
    if (typeof inner === 'string' && inner.trim()) found.push(inner.trim());
  }
  for (const inner of Object.values(record)) {
    if (inner && typeof inner === 'object') found.push(...messagesIn(inner, depth + 1));
  }
  return distinct(found);
}

/** " Mensaje: «not authorized» · «La sesión ha expirado»." o cadena vacía si no hay mensajes. */
export function describeMessages(value: unknown): string {
  const messages = messagesIn(value)
    .slice(0, 2)
    .map((message) => `«${clip(message, 120)}»`);
  return messages.length > 0 ? ` Mensaje: ${messages.join(' · ')}.` : '';
}
