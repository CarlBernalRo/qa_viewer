# Rastro

Graba sesiones de QA web: defines qué vas a comprobar, navegas como siempre en un Chromium controlado y Rastro guarda cada acción, request, frame de WebSocket, log de consola, métrica de rendimiento y el video de la pantalla en una sola línea de tiempo.

> Etapa 1 del MVP: grabar y revisar, **sin agentes de IA**. El análisis con agentes llega en la etapa 2.
> Visión y mockups: [`docs/rastro-vision.html`](docs/rastro-vision.html) y [`design/`](design/). Estado del trabajo: [`docs/PUNTO_DE_CONTROL.md`](docs/PUNTO_DE_CONTROL.md).

## Requisitos

- Node.js 22.12 o superior, con npm.
- Para la app de escritorio: Rust (toolchain estable) y, en Windows, Visual Studio Build Tools con C++ y WebView2 (Windows 11 ya lo trae).

## Instalación

```bash
npm install
npm run setup:browsers        # descarga Chromium para Playwright
```

## Correr la app

### App de escritorio (recomendado)

```bash
npm run dev:desktop
```

Tauri levanta el frontend, lanza el backend con un **puerto libre y un token aleatorio** en cada arranque, y abre la ventana. No hace falta ningún `.env`. Las sesiones se guardan en la carpeta de datos de la app.

### En el navegador, sin Tauri

1. Copia `backend/.env.example` a `backend/.env` y define `RASTRO_AUTH_TOKEN` (32 caracteres o más).
2. Copia `frontend/.env.example` a `frontend/.env` y pon el **mismo** token en `VITE_BACKEND_TOKEN`.
3. Corre `npm run dev` y abre http://127.0.0.1:5173.

Para usar Tauri contra un backend que ya está corriendo, define `RASTRO_EXTERNAL_BACKEND_URL` y `RASTRO_EXTERNAL_BACKEND_TOKEN` antes de `npm run dev:desktop`.

## Scripts

| Script | Qué hace |
|---|---|
| `npm run dev:desktop` | App de escritorio en modo desarrollo |
| `npm run dev` | Backend + frontend en el navegador |
| `npm run typecheck` | Typecheck de todos los paquetes |
| `npm test` | Tests de shared, backend y frontend (Vitest) |
| `npm run lint` | ESLint, incluidas las reglas de capas |
| `npm run smoke -w @rastro/backend` | Graba una página local con Chromium sin ventana y verifica captura, ocultamiento de datos y video |
| `npm run build` | Build de shared, backend y frontend |
| `npm run check -w @rastro/desktop` | `cargo check` del contenedor Tauri |

## Estructura

```
packages/shared/   Contratos compartidos (zod): objetivo, captura, sesión, eventos y API
backend/           Motor de captura (Node + TypeScript)
  src/domain/          Entidades, reglas y puertos, sin dependencias externas
  src/application/     Casos de uso: crear, grabar, detener, consultar
  src/infrastructure/  Playwright + CDP, archivos, configuración, logging
  src/interfaces/      HTTP (Fastify) y WebSocket en vivo
  tests/ · scripts/    Tests con fakes y la prueba de humo
frontend/          Interfaz (React + Vite)
  src/app/             Arranque, providers, router y puente en vivo
  src/shared/          Componentes reutilizables (ui/), cliente de la API, estilos y utilidades
  src/features/        sessions · new-session · session-detail (línea de tiempo, video, inspector)
desktop/           Contenedor Tauri 2 (src-tauri en Rust)
```

La dependencia va siempre hacia adentro: `interfaces` e `infrastructure` → `application` → `domain`. ESLint rechaza cualquier import en sentido contrario.

## Variables de entorno

Todas se validan al arrancar. Si falta algo o es inválido, el backend no arranca y dice qué corregir. Solo se versionan los `.env.example`.

| Variable | Default | Descripción |
|---|---|---|
| `RASTRO_HOST` | `127.0.0.1` | Solo acepta direcciones de loopback |
| `RASTRO_PORT` | `4318` | Puerto HTTP local |
| `RASTRO_AUTH_TOKEN` | — | Obligatoria, 32 caracteres o más |
| `RASTRO_ALLOWED_ORIGINS` | `http://localhost:5173` | Orígenes permitidos, separados por coma |
| `RASTRO_DATA_DIR` | `./data` | Dónde se guardan las sesiones |
| `RASTRO_LOG_LEVEL` | `info` | Nivel de log (pino) |
| `RASTRO_MAX_CONCURRENT_RECORDINGS` | `1` | Grabaciones simultáneas |
| `RASTRO_MAX_BODY_BYTES` | `262144` | Tamaño máximo de cuerpos y frames guardados |
| `RASTRO_VIDEO_SIZE` | `1600x900` | Tamaño del video. El navegador con ventana abre maximizado y responsivo |
| `RASTRO_BROWSER_HEADLESS` | `false` | Navegador sin ventana (CI y pruebas) |
| `RASTRO_PARENT_PID` | — | La define Tauri; si su proceso muere, el backend se apaga |

## Seguridad

- El backend solo escucha en loopback y rechaza hosts que no sean locales (protege contra DNS rebinding) y orígenes no permitidos.
- Cada request lleva un token Bearer. En la app de escritorio el token se genera en cada arranque y nunca queda en el bundle.
- Los datos sensibles se ocultan **antes** de guardarse: tarjetas (validadas con Luhn), tokens en headers, URL y JSON, cookies, emails, DNI y patrones propios.
- La página grabada no es de confianza: todo lo que envía el script inyectado se valida con zod.
