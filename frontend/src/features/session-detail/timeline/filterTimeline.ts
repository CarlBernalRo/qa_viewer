import type { LaneId, TimelineItem, TimelineModel } from './buildTimeline';

export const ALL_LANES: readonly LaneId[] = ['navigation', 'actions', 'network', 'websocket', 'console', 'performance'];

export type SeverityFilter = 'all' | 'errors' | 'warnings';

export interface TimelineFilters {
  lanes: ReadonlySet<LaneId>;
  severity: SeverityFilter;
  query: string;
}

export const DEFAULT_FILTERS: TimelineFilters = {
  lanes: new Set(ALL_LANES),
  severity: 'all',
  query: '',
};

export function isDefaultFilters(filters: TimelineFilters): boolean {
  return filters.lanes.size === ALL_LANES.length && filters.severity === 'all' && filters.query.trim() === '';
}

function matchesSeverity(item: TimelineItem, severity: SeverityFilter): boolean {
  if (severity === 'errors') return item.severity === 'error';
  if (severity === 'warnings') return item.severity === 'warn';
  return true;
}

/** Deja solo los carriles y elementos que pasan los filtros (el eje de tiempo no cambia). */
export function applyFilters(model: TimelineModel, filters: TimelineFilters): TimelineModel {
  const query = filters.query.trim().toLowerCase();
  const keep = (item: TimelineItem) =>
    matchesSeverity(item, filters.severity) && (!query || item.label.toLowerCase().includes(query));
  return {
    ...model,
    lanes: model.lanes
      .filter((lane) => filters.lanes.has(lane.id))
      .map((lane) => ({ ...lane, items: lane.items.filter(keep) })),
  };
}

export interface Problem extends TimelineItem {
  laneLabel: string;
}

/** Errores y avisos de toda la sesión, separados y en orden de aparición. */
export function collectProblems(model: TimelineModel): { errors: Problem[]; warnings: Problem[] } {
  const errors: Problem[] = [];
  const warnings: Problem[] = [];
  for (const lane of model.lanes) {
    for (const item of lane.items) {
      if (item.severity === 'error') errors.push({ ...item, laneLabel: lane.label });
      else if (item.severity === 'warn') warnings.push({ ...item, laneLabel: lane.label });
    }
  }
  const byTime = (a: Problem, b: Problem) => a.start - b.start;
  return { errors: errors.sort(byTime), warnings: warnings.sort(byTime) };
}

export interface LaunchBin {
  start: number;
  end: number;
  /** Peticiones HTTP lanzadas en este tramo. */
  count: number;
  /** Momento de la primera petición del tramo (ahí se dibuja el contador). */
  firstAt: number;
}

/**
 * Cuántas peticiones HTTP se lanzan en cada tramo de `binMs`, contadas en el momento
 * en que salen (no mientras duran). Respeta los filtros: sin el carril de red, no cuenta nada.
 */
export function requestLaunches(model: TimelineModel, binMs: number): LaunchBin[] {
  const network = model.lanes.find((lane) => lane.id === 'network');
  if (!network) return [];
  const bins = new Map<number, LaunchBin>();
  for (const item of network.items) {
    const index = Math.floor(item.start / binMs);
    const bin = bins.get(index);
    if (bin) {
      bin.count += 1;
      bin.firstAt = Math.min(bin.firstAt, item.start);
    } else {
      bins.set(index, {
        start: index * binMs,
        end: Math.min(model.durationMs, (index + 1) * binMs),
        count: 1,
        firstAt: item.start,
      });
    }
  }
  return [...bins.values()].sort((a, b) => a.start - b.start);
}

/** Elementos que ocurren cerca de `ms` (o que lo abarcan, como una request en curso). */
export function itemsAt(model: TimelineModel, ms: number, windowMs = 600): TimelineItem[] {
  const active: TimelineItem[] = [];
  for (const lane of model.lanes) {
    for (const item of lane.items) {
      const end = item.end ?? item.start;
      if (item.start - windowMs <= ms && end + windowMs >= ms) active.push(item);
    }
  }
  return active;
}
