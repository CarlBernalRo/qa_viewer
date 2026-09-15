import {
  a11yRuleText,
  type A11yImpact,
  type CaptureEvent,
  type CaptureEventOf,
  type Rect,
  type Viewport,
} from '@rastro/shared';

export interface Size {
  w: number;
  h: number;
}

export type OverlayTone = 'action' | A11yImpact;

/** Un recuadro sobre el video: un elemento de la página en un momento dado. */
export interface OverlayBox {
  id: string;
  /** Evento que se abre al hacer clic en el recuadro. */
  eventId: string;
  rect: Rect;
  viewport: Viewport;
  label: string;
  tone: OverlayTone;
}

type ScanEvent = CaptureEventOf<'a11y-scan'>;
type ActionEvent = CaptureEventOf<'user-action'>;

export interface OverlaySources {
  actions: ActionEvent[];
  /** `until`: hasta cuándo valen los rectángulos de la revisión (ver `overlaySources`). */
  scans: Array<{ scan: ScanEvent; viewport: Viewport | null; until: number }>;
}

/** Un clic se ve un instante antes y un rato después, para que dé tiempo a verlo. */
const ACTION_BEFORE_MS = 150;
const ACTION_AFTER_MS = 1500;
/**
 * Los rectángulos de accesibilidad son los del momento de la revisión: en cuanto el usuario
 * hace scroll dejan de coincidir, y el scroll no se graba. Por eso duran poco y se cortan en
 * la siguiente acción o navegación.
 */
const A11Y_AFTER_MS = 2500;
const MAX_A11Y_BOXES = 12;

const IMPACT_RANK: Record<A11yImpact, number> = { critical: 0, serious: 1, moderate: 2, minor: 3 };

const ACTION_VERBS: Record<ActionEvent['action'], string> = {
  click: 'Click en',
  input: 'Escribe en',
  change: 'Cambia',
  submit: 'Envía',
  keydown: 'Tecla en',
};

function nearestViewport(actions: readonly ActionEvent[], t: number): Viewport | null {
  let best: ActionEvent | null = null;
  for (const action of actions) {
    if (!best || Math.abs(action.t - t) < Math.abs(best.t - t)) best = action;
  }
  return best?.viewport ?? null;
}

/**
 * Lo que puede dibujarse sobre el video: acciones con su rectángulo y revisiones de
 * accesibilidad. Las revisiones grabadas antes de guardar la ventana usan la de la
 * acción más cercana (en una sesión la ventana casi no cambia).
 */
export function overlaySources(events: Iterable<CaptureEvent>): OverlaySources {
  const actions: ActionEvent[] = [];
  const scans: ScanEvent[] = [];
  /** Momentos en que la pantalla puede cambiar: cualquier acción o navegación. */
  const changes: number[] = [];
  for (const event of events) {
    if (event.kind === 'user-action') {
      changes.push(event.t);
      if (event.rect) actions.push(event);
    } else if (event.kind === 'navigation') {
      changes.push(event.t);
    } else if (event.kind === 'a11y-scan') {
      scans.push(event);
    }
  }
  changes.sort((a, b) => a - b);
  return {
    actions,
    scans: scans.map((scan) => {
      const nextChange = changes.find((t) => t > scan.t) ?? Number.POSITIVE_INFINITY;
      return {
        scan,
        viewport: scan.viewport ?? nearestViewport(actions, scan.t),
        until: Math.min(scan.t + A11Y_AFTER_MS, nextChange),
      };
    }),
  };
}

/** Recuadros visibles en el momento `ms` de la sesión. */
export function overlaysAt(sources: OverlaySources, ms: number): OverlayBox[] {
  const boxes: OverlayBox[] = [];
  for (const action of sources.actions) {
    if (!action.rect || ms < action.t - ACTION_BEFORE_MS || ms > action.t + ACTION_AFTER_MS) continue;
    const target = action.label?.trim() ? action.label : action.selector;
    boxes.push({
      id: action.id,
      eventId: action.id,
      rect: action.rect,
      viewport: action.viewport,
      label: `${ACTION_VERBS[action.action]} ${target}`,
      tone: 'action',
    });
  }
  for (const { scan, viewport, until } of sources.scans) {
    if (!viewport || ms < scan.t - scan.durationMs || ms >= until) continue;
    const nodes = scan.violations
      .flatMap((violation) =>
        violation.nodes.flatMap((node, index) =>
          node.rect && node.rect.w > 0 && node.rect.h > 0 ? [{ violation, rect: node.rect, index }] : [],
        ),
      )
      .sort((a, b) => IMPACT_RANK[a.violation.impact ?? 'minor'] - IMPACT_RANK[b.violation.impact ?? 'minor'])
      .slice(0, MAX_A11Y_BOXES);
    for (const { violation, rect, index } of nodes) {
      boxes.push({
        id: `${scan.id}:${violation.id}:${index}`,
        eventId: scan.id,
        rect,
        viewport,
        label: a11yRuleText(violation).help,
        tone: violation.impact ?? 'minor',
      });
    }
  }
  return boxes;
}

export interface ProjectedBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/**
 * Página → cuadro del video → elemento <video>.
 * Chromium achica la página (nunca la agranda más allá de su zoom) para que entre en el
 * tamaño del video y la ubica arriba a la izquierda. Después el <video> la muestra con
 * `object-fit: contain`, centrada y con bandas si sobra espacio.
 */
export function projectRect(rect: Rect, viewport: Viewport, video: Size, element: Size): ProjectedBox | null {
  if (!video.w || !video.h || !element.w || !element.h || !viewport.w || !viewport.h) return null;
  // Sin zoom guardado (sesiones anteriores), se supone que la página se achicó para entrar en el
  // video: es lo que pasa con la ventana maximizada en cualquier pantalla actual.
  const frameScale = Math.min(viewport.dpr ?? Number.POSITIVE_INFINITY, video.w / viewport.w, video.h / viewport.h);
  const display = Math.min(element.w / video.w, element.h / video.h);
  const offsetX = (element.w - video.w * display) / 2;
  const offsetY = (element.h - video.h * display) / 2;
  const scale = frameScale * display;
  // Solo la parte del elemento que se ve en la ventana.
  const x1 = clamp(rect.x, 0, viewport.w);
  const y1 = clamp(rect.y, 0, viewport.h);
  const x2 = clamp(rect.x + rect.w, 0, viewport.w);
  const y2 = clamp(rect.y + rect.h, 0, viewport.h);
  if (x2 - x1 < 1 || y2 - y1 < 1) return null;
  return { left: offsetX + x1 * scale, top: offsetY + y1 * scale, width: (x2 - x1) * scale, height: (y2 - y1) * scale };
}
