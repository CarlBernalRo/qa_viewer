import { LogicalPosition, LogicalSize, type PhysicalPosition, type PhysicalSize } from '@tauri-apps/api/dpi';
import { currentMonitor, getCurrentWindow } from '@tauri-apps/api/window';
import { useEffect } from 'react';
import { runningInTauri } from '../config/backendConfig';

/** Tamaño del widget de grabación y separación del borde de la pantalla. */
const WIDGET = { width: 460, height: 156 };
const MARGIN = 20;
const NORMAL_MIN_SIZE = new LogicalSize(1100, 720);

interface SavedWindow {
  size: PhysicalSize;
  position: PhysicalPosition;
  maximized: boolean;
}

let saved: SavedWindow | null = null;
let queue: Promise<void> = Promise.resolve();

/** Las operaciones de ventana se encadenan: entrar y salir nunca se pisan. */
function enqueue(task: () => Promise<void>): Promise<void> {
  queue = queue.then(task).catch(() => undefined);
  return queue;
}

/** Convierte la ventana de Rastro en un widget flotante, siempre visible, en la esquina inferior derecha. */
export function enterCompactWindow(): Promise<void> {
  if (!runningInTauri()) return Promise.resolve();
  return enqueue(async () => {
    if (saved) return;
    const win = getCurrentWindow();
    const maximized = await win.isMaximized();
    if (maximized) await win.unmaximize();
    saved = { size: await win.outerSize(), position: await win.outerPosition(), maximized };

    await win.setMinSize(null);
    await win.setDecorations(false);
    await win.setResizable(false);
    await win.setSize(new LogicalSize(WIDGET.width, WIDGET.height));
    const monitor = await currentMonitor();
    if (monitor) {
      const scale = monitor.scaleFactor;
      const area = monitor.workArea;
      const x = (area.position.x + area.size.width) / scale - WIDGET.width - MARGIN;
      const y = (area.position.y + area.size.height) / scale - WIDGET.height - MARGIN;
      await win.setPosition(new LogicalPosition(x, y));
    }
    await win.setAlwaysOnTop(true);
  });
}

/** Devuelve la ventana a su tamaño, posición y estado anteriores. */
export function exitCompactWindow(): Promise<void> {
  if (!runningInTauri()) return Promise.resolve();
  return enqueue(async () => {
    if (!saved) return;
    const previous = saved;
    saved = null;
    const win = getCurrentWindow();
    await win.setAlwaysOnTop(false);
    await win.setDecorations(true);
    await win.setResizable(true);
    await win.setSize(previous.size);
    await win.setPosition(previous.position);
    await win.setMinSize(NORMAL_MIN_SIZE);
    if (previous.maximized) await win.maximize();
    await win.setFocus();
  });
}

/** Mientras `active` sea true, la ventana está en modo widget. */
export function useCompactWindow(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    void enterCompactWindow();
    return () => {
      void exitCompactWindow();
    };
  }, [active]);
}
