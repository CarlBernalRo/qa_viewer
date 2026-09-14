import { describe, expect, it } from 'vitest';
import type { TimelineItem } from './buildTimeline';
import { layoutLane } from './layoutLane';

const point = (id: string, start: number): TimelineItem => ({
  id,
  eventId: id,
  lane: 'websocket',
  start,
  end: null,
  severity: 'normal',
  label: id,
});

describe('layoutLane', () => {
  it('con elementos separados usa un solo nivel', () => {
    const placed = layoutLane([point('a', 0), point('b', 5000)], 10_000, 1000);
    expect(new Set(placed.map((p) => p.top))).toEqual(new Set([10]));
  });

  it('apila en sub-filas los que caen en el mismo lugar', () => {
    const placed = layoutLane([point('a', 3900), point('b', 3902), point('c', 3905)], 10_000, 1000);
    const tops = placed.map((p) => p.top);
    expect(new Set(tops).size).toBe(3);
    expect(placed.every((p) => p.height >= 8)).toBe(true);
  });

  it('usa como máximo 3 sub-filas', () => {
    const many = Array.from({ length: 10 }, (_, index) => point(`p${index}`, 3900 + index));
    const placed = layoutLane(many, 10_000, 1000);
    expect(new Set(placed.map((p) => p.top)).size).toBe(3);
  });

  it('sin ancho medido no apila (primer render)', () => {
    const placed = layoutLane([point('a', 1), point('b', 2)], 10_000, 0);
    expect(new Set(placed.map((p) => p.top))).toEqual(new Set([10]));
  });
});
