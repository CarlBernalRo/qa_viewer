import { invoke, isTauri } from '@tauri-apps/api/core';
import { z } from 'zod';

export interface BackendConfig {
  url: string;
  token: string;
}

const devEnvSchema = z.object({
  VITE_BACKEND_URL: z.url({ protocol: /^http$/, hostname: /^(127\.0\.0\.1|localhost)$/ }),
  VITE_BACKEND_TOKEN: z.string().min(32),
});

const backendConfigSchema = z.object({ url: z.url(), token: z.string().min(32) });

/**
 * ¿Corre dentro de la ventana de Tauri? `isTauri()` solo mira la marca global
 * `window.isTauri`; además se revisa `__TAURI_INTERNALS__`, que es el puente que
 * usa `invoke`: si existe, se puede hablar con el proceso nativo.
 */
export function runningInTauri(): boolean {
  return isTauri() || (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window);
}

/**
 * Dentro de Tauri, la URL y el token los entrega el proceso nativo en cada arranque.
 * Fuera de Tauri (navegador en desarrollo) se leen de frontend/.env.
 */
export async function resolveBackendConfig(): Promise<BackendConfig> {
  if (runningInTauri()) {
    return backendConfigSchema.parse(await invoke('get_backend_config'));
  }
  if (!import.meta.env.DEV) {
    throw new Error('Esta versión de Rastro solo funciona dentro de la app de escritorio.');
  }
  const result = devEnvSchema.safeParse(import.meta.env);
  if (!result.success) {
    throw new Error(
      [
        'Esta pantalla está abierta en un navegador, fuera de la app de escritorio.',
        '• Si querías usar la app de escritorio, usa la ventana que abre "npm run dev:desktop".',
        '• Si querías el modo navegador, crea frontend/.env a partir de frontend/.env.example:',
        z.prettifyError(result.error),
      ].join('\n'),
    );
  }
  return {
    url: result.data.VITE_BACKEND_URL.replace(/\/$/, ''),
    token: result.data.VITE_BACKEND_TOKEN,
  };
}
