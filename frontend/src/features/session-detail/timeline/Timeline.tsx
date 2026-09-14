import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
  type RefObject,
} from 'react';
import { cx } from '../../../shared/lib/cx';
import { formatClock, formatDuration } from '../../../shared/lib/format';
import { useElementWidth } from '../../../shared/lib/useElementWidth';
import type { Severity, TimelineItem, TimelineModel } from './buildTimeline';
import { requestLaunches } from './filterTimeline';
import { layoutLane } from './layoutLane';
import styles from './Timeline.module.css';

interface TimelineProps {
  model: TimelineModel;
  selectedId: string | null;
  /** Elementos que coinciden con el momento actual del video. */
  activeIds: ReadonlySet<string>;
  currentMs: number;
  onSelect: (item: TimelineItem) => void;
}

const LABEL_WIDTH = 136;
/** Densidad mínima por defecto: por debajo de esto, una sesión larga abre con zoom y scroll lateral. */
const MIN_PX_PER_SECOND = 10;
const MAX_PX_PER_SECOND = 400;
const MIN_TICK_SPACING_PX = 90;
const ZOOM_FACTOR = 1.6;
const TICK_STEPS = [
  500, 1000, 2000, 5000, 10_000, 15_000, 30_000, 60_000, 120_000, 300_000, 600_000, 900_000, 1_800_000,
];
/** Tramos del contador de peticiones: el más fino que deje al menos 40 px por círculo. */
const BIN_STEPS = [100, 200, 250, 500, 1000, 2000, 5000, 10_000, 15_000, 30_000, 60_000, 120_000, 300_000];
const MIN_BIN_PX = 40;

/** Diámetro del círculo según la cantidad de dígitos: pequeño, pero siempre legible. */
function launchDiameter(count: number): number {
  if (count >= 100) return 30;
  if (count >= 10) return 24;
  return 20;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const SEVERITY_RANK: Record<Severity, number> = { normal: 1, warn: 2, error: 3 };

/** Tira con toda la sesión: marca errores y avisos, y un recuadro que muestra (y mueve) la parte visible. */
function Overview({
  model,
  scrollerRef,
  contentWidth,
  visibleWidth,
  currentMs,
}: {
  model: TimelineModel;
  scrollerRef: RefObject<HTMLDivElement | null>;
  contentWidth: number;
  visibleWidth: number;
  currentMs: number;
}) {
  const stripRef = useRef<HTMLDivElement>(null);
  const [scrollLeft, setScrollLeft] = useState(0);
  const dragging = useRef(false);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const onScroll = () => setScrollLeft(scroller.scrollLeft);
    onScroll();
    scroller.addEventListener('scroll', onScroll, { passive: true });
    return () => scroller.removeEventListener('scroll', onScroll);
  }, [scrollerRef]);

  const buckets = useMemo(() => {
    const count = 240;
    const result: Array<Severity | null> = new Array<Severity | null>(count).fill(null);
    for (const lane of model.lanes) {
      for (const item of lane.items) {
        const index = Math.min(count - 1, Math.floor((item.start / model.durationMs) * count));
        const current = result[index];
        if (!current || SEVERITY_RANK[item.severity] > SEVERITY_RANK[current]) result[index] = item.severity;
      }
    }
    return result;
  }, [model]);

  const moveTo = (clientX: number) => {
    const strip = stripRef.current;
    const scroller = scrollerRef.current;
    if (!strip || !scroller) return;
    const rect = strip.getBoundingClientRect();
    const fraction = clamp((clientX - rect.left) / rect.width, 0, 1);
    scroller.scrollLeft = fraction * contentWidth - visibleWidth / 2;
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    dragging.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    moveTo(event.clientX);
  };

  return (
    <div
      ref={stripRef}
      className={styles.overview}
      role="scrollbar"
      aria-label="Vista general de la sesión"
      aria-controls="timeline-scroller"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round((scrollLeft / Math.max(1, contentWidth - visibleWidth)) * 100)}
      onPointerDown={onPointerDown}
      onPointerMove={(event) => dragging.current && moveTo(event.clientX)}
      onPointerUp={() => (dragging.current = false)}
      onPointerCancel={() => (dragging.current = false)}
    >
      {buckets.map((severity, index) =>
        severity ? (
          <span
            key={index}
            className={cx(styles.overviewMark, styles[`overview_${severity}`])}
            style={{ left: `${(index / buckets.length) * 100}%` }}
          />
        ) : null,
      )}
      <span className={styles.overviewPlayhead} style={{ left: `${(currentMs / model.durationMs) * 100}%` }} />
      <span
        className={styles.overviewWindow}
        style={{
          left: `${(scrollLeft / contentWidth) * 100}%`,
          width: `${Math.min(100, (visibleWidth / contentWidth) * 100)}%`,
        }}
      />
    </div>
  );
}

export function Timeline({ model, selectedId, activeIds, currentMs, onSelect }: TimelineProps) {
  const { durationMs } = model;
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [measureRef, viewportWidth] = useElementWidth<HTMLDivElement>();
  const setScroller = useCallback(
    (node: HTMLDivElement | null) => {
      scrollerRef.current = node;
      return measureRef(node);
    },
    [measureRef],
  );

  // Escala: 1 = la sesión entera cabe en el ancho visible. Más zoom = más ancho y scroll lateral.
  const visibleWidth = Math.max(240, viewportWidth - LABEL_WIDTH);
  const seconds = Math.max(1, durationMs / 1000);
  const maxZoom = Math.max(1, (MAX_PX_PER_SECOND * seconds) / visibleWidth);
  const autoZoom = clamp((MIN_PX_PER_SECOND * seconds) / visibleWidth, 1, maxZoom);
  const [zoomChoice, setZoomChoice] = useState<number | null>(null);
  const zoom = clamp(zoomChoice ?? autoZoom, 1, maxZoom);
  const contentWidth = Math.round(visibleWidth * zoom);
  const pxPerMs = contentWidth / durationMs;
  const zoomed = contentWidth > visibleWidth + 1;

  const step = TICK_STEPS.find((candidate) => candidate * pxPerMs >= MIN_TICK_SPACING_PX) ?? 1_800_000;
  const ticks: number[] = [];
  for (let t = 0; t <= durationMs; t += step) ticks.push(t);

  // Al cambiar el zoom se conserva el momento que estaba bajo el cursor (o en el centro).
  const anchor = useRef<{ time: number; offset: number } | null>(null);
  const changeZoom = useCallback(
    (next: number, offsetPx?: number) => {
      const scroller = scrollerRef.current;
      const offset = offsetPx ?? visibleWidth / 2;
      if (scroller) anchor.current = { time: (scroller.scrollLeft + offset) / pxPerMs, offset };
      setZoomChoice(clamp(next, 1, maxZoom));
    },
    [visibleWidth, pxPerMs, maxZoom],
  );

  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    const pending = anchor.current;
    if (!scroller || !pending) return;
    anchor.current = null;
    scroller.scrollLeft = Math.max(0, pending.time * pxPerMs - pending.offset);
  }, [pxPerMs]);

  // Ctrl + rueda: zoom alrededor del cursor. Necesita un listener no pasivo para evitar el zoom del navegador.
  const latest = useRef({ zoom, changeZoom });
  useEffect(() => {
    latest.current = { zoom, changeZoom };
  }, [zoom, changeZoom]);
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      const offset = event.clientX - scroller.getBoundingClientRect().left - LABEL_WIDTH;
      if (offset < 0) return;
      latest.current.changeZoom(latest.current.zoom * (event.deltaY < 0 ? 1.25 : 0.8), offset);
    };
    scroller.addEventListener('wheel', onWheel, { passive: false });
    return () => scroller.removeEventListener('wheel', onWheel);
  }, []);

  // Si el video (o la selección) va a un momento fuera de la vista, la línea de tiempo lo sigue.
  const lastFollowed = useRef<number | null>(null);
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller || !zoomed || lastFollowed.current === currentMs) return;
    lastFollowed.current = currentMs;
    const x = currentMs * pxPerMs;
    if (x < scroller.scrollLeft + 24 || x > scroller.scrollLeft + visibleWidth - 48) {
      scroller.scrollTo({ left: Math.max(0, x - visibleWidth * 0.3), behavior: 'smooth' });
    }
  }, [currentMs, pxPerMs, zoomed, visibleWidth]);

  // Los eventos casi simultáneos se reparten en sub-filas para no taparse.
  const placedLanes = useMemo(
    () => model.lanes.map((lane) => ({ lane, placed: layoutLane(lane.items, durationMs, contentWidth) })),
    [model.lanes, durationMs, contentWidth],
  );

  // Contador de peticiones lanzadas a la vez en cada tramo.
  const binMs = BIN_STEPS.find((candidate) => candidate * pxPerMs >= MIN_BIN_PX) ?? 300_000;
  const launches = useMemo(() => requestLaunches(model, binMs), [model, binMs]);
  const peak = Math.max(0, ...launches.map((bin) => bin.count));
  const showTenths = step < 1000;

  if (model.lanes.length === 0) {
    return <p className={styles.empty}>Elige al menos un canal en el filtro para ver la línea de tiempo.</p>;
  }

  const playheadX = clamp(currentMs, 0, durationMs) * pxPerMs;

  return (
    <div className={styles.timeline}>
      <div className={styles.zoomBar}>
        <span className={styles.zoomLabel}>
          {zoomed
            ? `Viendo ${formatDuration(visibleWidth / pxPerMs)} de ${formatDuration(durationMs)}`
            : `Sesión completa · ${formatDuration(durationMs)}`}
        </span>
        {zoomed && (
          <Overview
            model={model}
            scrollerRef={scrollerRef}
            contentWidth={contentWidth}
            visibleWidth={visibleWidth}
            currentMs={currentMs}
          />
        )}
        <div className={styles.zoomControls} role="group" aria-label="Zoom de la línea de tiempo">
          <button
            type="button"
            className={styles.zoomButton}
            onClick={() => changeZoom(zoom / ZOOM_FACTOR)}
            disabled={zoom <= 1}
            aria-label="Alejar"
            title="Alejar (Ctrl + rueda)"
          >
            −
          </button>
          <button
            type="button"
            className={styles.zoomButton}
            onClick={() => changeZoom(zoom * ZOOM_FACTOR)}
            disabled={zoom >= maxZoom}
            aria-label="Acercar"
            title="Acercar (Ctrl + rueda)"
          >
            +
          </button>
          <button
            type="button"
            className={styles.fitButton}
            onClick={() => changeZoom(1, 0)}
            disabled={!zoomed}
            title="Ver toda la sesión"
          >
            Ajustar
          </button>
        </div>
      </div>

      <div id="timeline-scroller" ref={setScroller} className={styles.scroller}>
        <div
          className={styles.canvas}
          style={{ '--label-width': `${LABEL_WIDTH}px`, width: LABEL_WIDTH + contentWidth } as CSSProperties}
        >
          <div className={styles.row} style={{ gridTemplateColumns: `${LABEL_WIDTH}px ${contentWidth}px` }}>
            <span className={styles.stickyCell} />
            <div className={cx(styles.track, styles.ruler)}>
              {ticks.map((t) => (
                <span
                  key={t}
                  // El último número se alinea a la izquierda de su marca para no cortarse en el borde.
                  className={cx(styles.tick, t > 0 && t * pxPerMs > contentWidth - 28 && styles.tickEnd)}
                  style={{ left: t * pxPerMs }}
                >
                  {formatClock(t, showTenths)}
                </span>
              ))}
            </div>
          </div>

          <div className={styles.grid} aria-hidden="true">
            {ticks.map((t) => (
              <span key={t} style={{ left: t * pxPerMs }} />
            ))}
          </div>

          {placedLanes.map(({ lane, placed }) => (
            <div
              key={lane.id}
              className={cx(styles.row, styles.lane)}
              style={{ gridTemplateColumns: `${LABEL_WIDTH}px ${contentWidth}px` }}
            >
              <div className={cx(styles.laneLabel, styles.stickyCell)}>
                <span className={styles.swatch} style={{ background: lane.color }} aria-hidden="true" />
                <span>{lane.label}</span>
                <span className={styles.count}>{lane.items.length}</span>
              </div>
              <div className={styles.track}>
                {placed.map(({ item, top, height }) => (
                  <button
                    key={item.id}
                    type="button"
                    className={cx(
                      styles.item,
                      item.end !== null && styles.bar,
                      styles[item.severity],
                      item.eventId === selectedId && styles.selected,
                      activeIds.has(item.id) && styles.active,
                    )}
                    style={
                      {
                        left: item.start * pxPerMs,
                        top,
                        height,
                        ...(item.end !== null ? { width: Math.max(3, (item.end - item.start) * pxPerMs) } : {}),
                        '--lane-color': lane.color,
                      } as CSSProperties
                    }
                    title={`${formatClock(item.start)} · ${item.label}`}
                    aria-label={`${formatClock(item.start)} ${item.label}`}
                    onClick={() => onSelect(item)}
                  />
                ))}
              </div>
            </div>
          ))}

          <div
            className={cx(styles.row, styles.activityRow)}
            style={{ gridTemplateColumns: `${LABEL_WIDTH}px ${contentWidth}px` }}
          >
            <div
              className={cx(styles.laneLabel, styles.stickyCell)}
              title={`Peticiones HTTP lanzadas en cada tramo de ${formatDuration(binMs)}. Pico: ${peak} (resaltado).`}
            >
              <span className={styles.swatch} style={{ background: 'var(--ch-network)' }} aria-hidden="true" />
              <span>PETICIONES</span>
            </div>
            <div className={styles.track}>
              {launches.map((bin) => {
                const diameter = launchDiameter(bin.count);
                const binStart = bin.start * pxPerMs;
                const binEnd = bin.end * pxPerMs;
                const radius = diameter / 2;
                // Se dibuja donde sale la primera petición, sin salirse de su tramo (así no se pisan).
                const center =
                  binEnd - binStart >= diameter
                    ? clamp(bin.firstAt * pxPerMs, binStart + radius, binEnd - radius)
                    : (binStart + binEnd) / 2;
                const intensity = peak > 0 ? bin.count / peak : 0;
                return (
                  <span
                    key={bin.start}
                    className={cx(
                      styles.launch,
                      intensity >= 0.6 && styles.launchStrong,
                      bin.count === peak && styles.launchPeak,
                    )}
                    style={{ left: center, width: diameter, height: diameter, '--intensity': intensity } as CSSProperties}
                    title={`${bin.count} ${bin.count === 1 ? 'petición lanzada' : 'peticiones lanzadas'} entre ${formatClock(bin.start)} y ${formatClock(bin.end)}`}
                  >
                    {bin.count}
                  </span>
                );
              })}
            </div>
          </div>

          <div className={styles.playhead} style={{ left: LABEL_WIDTH + playheadX }} aria-hidden="true" />
        </div>
      </div>
    </div>
  );
}
