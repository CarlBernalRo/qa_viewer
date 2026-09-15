import type { A11yViolation, CaptureEvent } from '@rastro/shared';
import { describe, expect, it } from 'vitest';
import { overlaySources, overlaysAt, projectRect } from './overlays';

describe('projectRect', () => {
  it('achica la página al video y el video al reproductor', () => {
    // Ventana 1920×960 en un video de 1600×900: la página se achica a 0,833.
    const box = projectRect({ x: 960, y: 480, w: 192, h: 96 }, { w: 1920, h: 960 }, { w: 1600, h: 900 }, { w: 800, h: 450 });
    expect(box).toEqual({ left: 400, top: 200, width: 80, height: 40 });
  });

  it('respeta las bandas del reproductor (object-fit: contain)', () => {
    const box = projectRect({ x: 960, y: 480, w: 192, h: 96 }, { w: 1920, h: 960 }, { w: 1600, h: 900 }, { w: 800, h: 520 });
    expect(box?.top).toBe(235);
  });

  it('no agranda una ventana chica, salvo por el zoom de pantalla', () => {
    const rect = { x: 100, y: 50, w: 10, h: 10 };
    expect(projectRect(rect, { w: 800, h: 450, dpr: 1 }, { w: 1600, h: 900 }, { w: 1600, h: 900 })?.left).toBe(100);
    expect(projectRect(rect, { w: 800, h: 450, dpr: 2 }, { w: 1600, h: 900 }, { w: 1600, h: 900 })?.left).toBe(200);
  });

  it('sin zoom guardado supone que la página se achicó para entrar en el video (Windows al 125%)', () => {
    // Ventana 1536×730 (1920 al 125%) en un video de 1600×900: la página ocupa 1600×760.
    const box = projectRect({ x: 768, y: 365, w: 96, h: 48 }, { w: 1536, h: 730 }, { w: 1600, h: 900 }, { w: 1600, h: 900 });
    expect(box?.left).toBeCloseTo(800, 5);
    expect(box?.width).toBeCloseTo(100, 5);
  });

  it('recorta lo que queda fuera de la ventana y descarta lo que no se ve', () => {
    const viewport = { w: 1600, h: 900 };
    const size = { w: 1600, h: 900 };
    expect(projectRect({ x: 1500, y: 850, w: 300, h: 300 }, viewport, size, size)).toEqual({ left: 1500, top: 850, width: 100, height: 50 });
    expect(projectRect({ x: 0, y: 1200, w: 50, h: 50 }, viewport, size, size)).toBeNull();
    expect(projectRect({ x: 0, y: 0, w: 50, h: 50 }, viewport, { w: 0, h: 0 }, size)).toBeNull();
  });
});

const viewport = { w: 1280, h: 720 };

const click = (id: string, t: number): CaptureEvent => ({
  id,
  t,
  pageId: 'p1',
  kind: 'user-action',
  action: 'click',
  selector: 'button#pagar',
  label: 'Pagar',
  rect: { x: 10, y: 10, w: 80, h: 30 },
  viewport,
});

const violation = (id: string, impact: A11yViolation['impact'], count: number): A11yViolation => ({
  id,
  impact,
  help: `Ayuda de ${id}`,
  description: '',
  helpUrl: '',
  tags: [],
  nodeCount: count,
  nodes: Array.from({ length: count }, (_, index) => ({
    target: `.n${index}`,
    html: '<x>',
    rect: { x: index * 10, y: 100, w: 8, h: 8 },
  })),
});

describe('overlaysAt', () => {
  it('muestra el clic poco antes y un rato después, y luego lo quita', () => {
    const sources = overlaySources([click('a1', 5000)]);
    expect(overlaysAt(sources, 4900).map((box) => box.label)).toEqual(['Click en Pagar']);
    expect(overlaysAt(sources, 6400)).toHaveLength(1);
    expect(overlaysAt(sources, 7000)).toHaveLength(0);
  });

  it('prioriza lo más grave de accesibilidad y no llena la pantalla', () => {
    const scan: CaptureEvent = {
      id: 's1',
      t: 3000,
      pageId: 'p1',
      kind: 'a11y-scan',
      url: 'https://qa.test',
      durationMs: 400,
      viewport,
      passes: 10,
      violations: [violation('color-contrast', 'serious', 20), violation('button-name', 'critical', 3)],
    };
    const boxes = overlaysAt(overlaySources([scan]), 4000);
    expect(boxes).toHaveLength(12);
    expect(boxes.slice(0, 3).map((box) => box.tone)).toEqual(['critical', 'critical', 'critical']);
    expect(boxes[0]?.eventId).toBe('s1');
    expect(overlaysAt(overlaySources([scan]), 6000)).toHaveLength(0);
  });

  it('los recuadros de accesibilidad se cortan en la siguiente acción (después la página pudo moverse)', () => {
    const scan: CaptureEvent = {
      id: 's1',
      t: 3000,
      pageId: 'p1',
      kind: 'a11y-scan',
      url: 'https://qa.test',
      durationMs: 400,
      viewport,
      passes: 10,
      violations: [violation('image-alt', 'critical', 2)],
    };
    const sources = overlaySources([scan, click('a1', 4000)]);
    expect(overlaysAt(sources, 3900).filter((box) => box.eventId === 's1')).toHaveLength(2);
    expect(overlaysAt(sources, 4100).filter((box) => box.eventId === 's1')).toHaveLength(0);
  });

  it('una revisión sin ventana usa la de la acción más cercana; sin acciones no dibuja', () => {
    const scan: CaptureEvent = {
      id: 's1',
      t: 3000,
      pageId: 'p1',
      kind: 'a11y-scan',
      url: 'https://qa.test',
      durationMs: 400,
      passes: 10,
      violations: [violation('image-alt', 'critical', 1)],
    };
    expect(overlaysAt(overlaySources([click('a1', 1000), scan]), 3500).find((box) => box.eventId === 's1')?.viewport).toEqual(
      viewport,
    );
    expect(overlaysAt(overlaySources([scan]), 3500)).toHaveLength(0);
  });
});
