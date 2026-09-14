import type { TimelineItem } from './buildTimeline';

/** Alto del carril y separación entre sub-filas, en píxeles. */
const LANE_HEIGHT = 38;
const PADDING = 3;
const GAP = 2;
const MAX_ROWS = 3;
/** Ancho mínimo que ocupa un punto (para decidir si choca con el siguiente). */
const POINT_WIDTH = 4;
const MIN_SPACING = 2;

export interface PlacedItem {
  item: TimelineItem;
  top: number;
  height: number;
}

/**
 * Reparte los elementos de un carril en hasta 3 sub-filas para que los que ocurren
 * casi al mismo tiempo no se tapen entre sí (y se puedan clickear).
 */
export function layoutLane(items: readonly TimelineItem[], durationMs: number, widthPx: number): PlacedItem[] {
  if (items.length === 0) return [];
  const rowEnds: number[] = [];
  const rows: number[] = [];
  const sorted = items.map((item, index) => ({ item, index })).sort((a, b) => a.item.start - b.item.start);

  for (const { item, index } of sorted) {
    if (widthPx <= 0) {
      rows[index] = 0;
      continue;
    }
    const x = (item.start / durationMs) * widthPx;
    const x2 = item.end !== null ? Math.max(x + POINT_WIDTH, (item.end / durationMs) * widthPx) : x + POINT_WIDTH;
    let row = rowEnds.findIndex((end) => end + MIN_SPACING <= x);
    if (row === -1) {
      if (rowEnds.length < MAX_ROWS) {
        row = rowEnds.length;
      } else {
        // Sin lugar: se usa la sub-fila que se liberó antes.
        row = rowEnds.indexOf(Math.min(...rowEnds));
      }
    }
    rowEnds[row] = Math.max(rowEnds[row] ?? 0, x2);
    rows[index] = row;
  }

  const rowCount = Math.max(1, rowEnds.length);
  return items.map((item, index) => {
    const row = rows[index] ?? 0;
    if (rowCount === 1) {
      // Un solo nivel: marcadores altos, como siempre.
      return item.end !== null ? { item, top: 11, height: 16 } : { item, top: 10, height: 18 };
    }
    const height = Math.floor((LANE_HEIGHT - PADDING * 2 - GAP * (rowCount - 1)) / rowCount);
    return { item, top: PADDING + row * (height + GAP), height };
  });
}
