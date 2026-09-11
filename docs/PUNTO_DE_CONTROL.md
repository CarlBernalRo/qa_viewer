# Punto de control · 2026-09-11

Etapa 1 del MVP de Rastro: **grabar y reproducir una sesión, sin IA**. El código está empezado; todavía no se instalaron dependencias ni se ejecutaron typecheck ni tests.

## Decisiones tomadas

| Tema | Decisión | Motivo |
|---|---|---|
| Monorepo | Workspaces de npm (`packages/*`, `backend`, `frontend`, `desktop`) | pnpm no está instalado en la máquina |
| Lenguaje | TypeScript **6.0.3** | TS 7 todavía no es compatible con typescript-eslint (`<6.1.0`) |
| Escritorio | Tauri 2 (Rust) como contenedor | Preferencia del usuario |
| Backend | Node + TS: Fastify 5, Playwright 1.63 + CDP, zod 4, pino | Playwright solo corre en Node; Tauri lanza el backend |
| Frontend | React 19 + Vite 8 + React Router + TanStack Query | — |
| Persistencia | Archivos por sesión: `session.json`, `events.ndjson`, `video.webm` | Sin dependencias nativas; está detrás de un puerto y se puede cambiar a SQLite |
| Seguridad | Backend solo en loopback, token aleatorio por arranque (lo genera Tauri), CORS limitado, variables de entorno validadas con zod | Nada queda expuesto fuera de la máquina |
| Paquete compartido | Condición de export `source` en desarrollo (tsx, Vite, typecheck) y `dist` en producción | Un solo contrato para frontend y backend |
| Arquitectura | `domain` → `application` → `infrastructure` / `interfaces` | ESLint prohíbe los imports en sentido contrario |
| Análisis con agentes | Solo el modo "Sin agentes" en la etapa 1; los otros modos devuelven `FEATURE_NOT_AVAILABLE` | Coincide con el plan del MVP |

## Estructura actual

```
QA_TESTER/
├─ package.json, tsconfig.base.json, eslint.config.js, .prettierrc.json, .editorconfig, .gitignore
├─ packages/shared/          contratos zod compartidos
│  └─ src/ session.ts · events.ts · api.ts · index.ts · events.test.ts
├─ backend/
│  ├─ package.json, tsconfig*.json, vitest.config.ts, .env.example
│  └─ src/
│     ├─ domain/             errors.ts · ports.ts · session/ (Session, stats) · redaction/ (Redactor)
│     └─ application/        recording/ (RecordingRegistry, ActiveRecording) · use-cases/ · index.ts
├─ design/                   mockups (.dc.html) y canvas publicado
└─ docs/                     documento de visión y este punto de control
```

## Hecho

- **Configuración raíz:** workspaces, TypeScript estricto, ESLint con reglas de capas, Prettier y `.gitignore`. Los `.env` nunca se versionan, solo los `.env.example`.
- **`packages/shared`:** esquemas zod para objetivo, criterios, configuración de captura, sesión, estadísticas, los 13 tipos de evento de captura, mensajes en vivo por WebSocket y rutas de la API. Incluye tests.
- **`backend/domain`:**
  - Entidad `Session` con ciclo de vida `draft → recording → completed | failed`.
  - Estadísticas de la sesión.
  - `Redactor`: tarjetas validadas con Luhn, emails, DNI, tokens en headers, URL y JSON, y patrones propios.
  - Puertos: repositorio, almacén de eventos, almacén de media, grabador, reloj, ids, notificador y logger.
  - Incluye tests.
- **`backend/application`:**
  - `RecordingRegistry` controla el límite de grabaciones simultáneas.
  - `ActiveRecording` oculta los datos sensibles de cada evento, lo registra, publica estadísticas y cierra la sesión.
  - Casos de uso: crear, listar, obtener, eventos, video, iniciar y detener la grabación, y recuperar sesiones interrumpidas.
- **Git:** repo con `origin = https://github.com/CarlBernalRo/qa_viewer.git`. Este punto de control está subido a `main`, sobre el commit inicial remoto (README).

## Pendiente, en orden

1. **`backend/src/infrastructure`**
   - `config/env.ts`: zod, loopback obligatorio y token de 32 caracteres o más.
   - `logging/`: pino.
   - `persistence/`: `FileSessionRepository` con escritura atómica, `FileEventStore` (ndjson con cola ordenada) y `FileMediaStore`.
   - `system/`: reloj e ids.
   - `recording/playwright/`: `PlaywrightRecorder` con video de Playwright, colectores CDP de red, WebSocket, SSE y consola, y el script inyectado de acciones de usuario (selector y rectángulo, para los overlays) y Web Vitals (LCP, CLS, INP, tareas largas). Cuerpos de respuesta con el límite `RASTRO_MAX_BODY_BYTES`.
2. **`backend/src/interfaces/http`:** Fastify, autenticación por token (header, o query solo para el video), CORS según `RASTRO_ALLOWED_ORIGINS`, errores de dominio traducidos a HTTP, rutas de `API_ROUTES`, streaming del video y WebSocket en vivo (`LiveHub`).
3. **`backend/src/main.ts`:** composition root, recuperación de sesiones interrumpidas y apagado limpio (SIGINT/SIGTERM detienen las grabaciones).
4. **Tests del backend:** `tests/fakes.ts`, casos de uso con fakes y rutas con `fastify.inject`.
5. **Verificación:** `npm install`, `npm run setup:browsers`, `npm run typecheck`, `npm test`, `npm run lint`.
6. **`frontend`**
   - Configuración de Vite y variables de entorno validadas (`VITE_BACKEND_URL`, `VITE_BACKEND_TOKEN` para desarrollo sin Tauri).
   - Tokens de diseño tomados del mockup.
   - Componentes reutilizables: `Button`, `Panel`, `Chip`, `Field`, `Toggle`, `SegmentedControl`, `Stepper`, `AppShell`.
   - Pantallas: Sesiones, Nueva sesión (objetivo + captura), grabación en vivo y detalle con línea de tiempo y video.
7. **`desktop` (Tauri 2):** `src-tauri` lanza el backend con puerto y token aleatorio, comando `get_backend_config`, carpeta de datos de la app, íconos y capacidades mínimas.
8. **Cierre:** README con instrucciones de uso.

## Cómo retomar

Decir "retomemos Rastro desde el punto de control". El siguiente paso es el punto 1: la infraestructura del backend.
