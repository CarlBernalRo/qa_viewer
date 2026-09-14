import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { ApiClient } from '../../shared/api/ApiClient';
import { resolveBackendConfig } from '../../shared/config/backendConfig';
import { SplashScreen } from '../SplashScreen';

const ApiContext = createContext<ApiClient | null>(null);

export function useApi(): ApiClient {
  const api = useContext(ApiContext);
  if (!api) throw new Error('useApi debe usarse dentro de <BackendProvider>.');
  return api;
}

type ConnectionState =
  | { status: 'connecting' }
  | { status: 'ready'; api: ApiClient }
  | { status: 'error'; message: string };

const HEALTH_ATTEMPTS = 60;
const HEALTH_INTERVAL_MS = 250;

/** El backend puede tardar unos segundos en arrancar: se reintenta antes de rendirse. */
async function waitForBackend(api: ApiClient): Promise<void> {
  for (let attempt = 1; attempt <= HEALTH_ATTEMPTS; attempt += 1) {
    try {
      await api.health();
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, HEALTH_INTERVAL_MS));
    }
  }
  throw new Error('El motor de captura no respondió. Revisa que el backend esté corriendo.');
}

export function BackendProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ConnectionState>({ status: 'connecting' });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const api = new ApiClient(await resolveBackendConfig());
        await waitForBackend(api);
        if (!cancelled) setState({ status: 'ready', api });
      } catch (error) {
        if (!cancelled) {
          setState({ status: 'error', message: error instanceof Error ? error.message : String(error) });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.status === 'connecting') return <SplashScreen message="Iniciando el motor de captura…" />;
  if (state.status === 'error') return <SplashScreen message="No se pudo conectar" error={state.message} />;
  return <ApiContext.Provider value={state.api}>{children}</ApiContext.Provider>;
}
