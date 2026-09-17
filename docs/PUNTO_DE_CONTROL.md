# Punto de control · 2026-09-14

**Etapa 1 del MVP completa en código:** definir el objetivo, grabar con Chromium controlado y revisar la sesión con video, línea de tiempo e inspector, sin IA. Typecheck, lint, tests y prueba de humo en verde. Falta probar la app de escritorio a mano.

## Estado de verificación

| Chequeo | Resultado |
|---|---|
| `npm run typecheck` (shared, backend, frontend) | OK |
| `npm run lint` | OK, sin errores |
| `npm test` | 46 tests OK (shared 4 · backend 31 · frontend 11) |
| `npm run smoke -w @rastro/backend` | 12/12: click con rectángulo, POST 500 con cuerpo, frames WS, console.error, Web Vitals, video, y token de URL, `Authorization` y número de tarjeta ocultos |
| `npm run build` (shared, backend, frontend) | OK |
| `cargo check` de `desktop/src-tauri` | OK |
| App de escritorio abierta y usada a mano | **Pendiente** |

## Decisiones tomadas

| Tema | Decisión | Motivo |
|---|---|---|
| Monorepo | Workspaces de npm (`packages/*`, `backend`, `frontend`, `desktop`) | pnpm no está instalado |
| Lenguaje | TypeScript 6.0.3 | TS 7 aún no es compatible con typescript-eslint |
| Escritorio | Tauri 2: genera puerto y token por arranque y lanza el backend | Preferencia del usuario; el token nunca queda en el bundle |
| Backend | Fastify 5 + pino 10, Playwright 1.63 + CDP, zod 4 | Playwright solo corre en Node |
| Frontend | React 19, Vite 8, React Router 7 (hash router), TanStack Query 5, CSS Modules con tokens del mockup | El hash router funciona igual en Vite y en Tauri |
| Persistencia | Archivos por sesión: `session.json` con escritura atómica, `events.ndjson` y `video.webm` | Sin dependencias nativas; está detrás de puertos |
| Seguridad | Loopback, chequeo de Host y Origin, token Bearer (por query solo en video y WebSocket), ocultamiento de datos antes de guardar | — |
| Script inyectado | Se inyecta como texto con un `__name` local | tsx/esbuild agrega llamadas a `__name`, que rompían el script dentro de la página |
| Análisis con agentes | Solo "Sin agentes"; los otros modos responden 501 | Etapa 1 |

## Cambios después de la primera prueba del usuario (14-09)

- **Corregido: el backend se caía al cerrar Chromium con la X.** El transporte de pino corría en un worker y, cuando ese worker moría, tumbaba el proceso. Ahora los logs se escriben en el hilo principal, en consola y en `data/logs/backend.log`.
- **Corregido: video bloqueado en Windows (`EBUSY`).** Se usa `video.saveAs()`, se reintenta el movimiento del archivo, y si aun así falla, la sesión se completa sin video.
- **Tauri reinicia el backend** si termina inesperadamente, hasta 5 veces. El frontend avisa cuando se pierde la conexión y refresca los datos al volver.
- **Eliminar sesión:** `DELETE /api/sessions/:id`, con confirmación, desde la lista y desde el detalle.
- **Navegador maximizado y responsivo:** la página no tiene viewport fijo. `RASTRO_VIEWPORT` pasó a llamarse `RASTRO_VIDEO_SIZE`.
- **Modo widget:** mientras graba, la ventana de Rastro se vuelve un widget flotante, siempre visible, abajo a la derecha. Al terminar, vuelve a su tamaño y posición.
- **Revisión de la sesión:**
  - Lista de errores y avisos clicable, y chip "N errores · ver cuáles".
  - Filtros por canal, "solo errores y avisos" y búsqueda por texto.
  - Inspector fijo con scroll propio.
  - Visor de JSON en árbol (con modo texto y copiar) y tabla de headers.
- **Menú lateral colapsable:** arranca oculto y recuerda la preferencia.
- **Tooltips ⓘ** en todas las opciones del asistente, y descripción dinámica del tipo de prueba y del ambiente.
- **Skeletons de carga** en la lista, el detalle, los errores y la línea de tiempo.

## Segunda ronda de mejoras (14-09)

- **WebSocket legible:** decodificador de Socket.IO, Engine.IO y SIP en `@rastro/shared` (`decodeWsPayload`). Al elegir un frame, el inspector muestra la conversación completa de esa conexión. Los `connect_error` de Socket.IO y las respuestas SIP de error cuentan como errores en el backend y en el frontend.
- **Errores y avisos separados:** pestañas en la lista y filtro Todo / Errores / Avisos. El chip del encabezado usa el mismo conteo que la lista.
- **Video sincronizado:**
  - Mientras se reproduce, se resaltan los eventos de ese momento en la línea de tiempo y en la lista.
  - Debajo del video aparece "En este momento".
  - Se corrigió el desfase: la sesión guarda `videoOffsetMs`, el instante en que empezó el video.
- **Navegación:** paneles plegables que recuerdan su estado, menú "Acciones ▾" en el encabezado, filtro de canales como desplegable con casillas y buscador en el título de la línea de tiempo.
- **Superposiciones:**
  - Los eventos casi simultáneos se apilan en sub-filas (`layoutLane`).
  - Los tooltips se dibujan fuera de las tarjetas.
  - La página ya no tiene scroll propio: se eliminaron la doble barra y el hueco inferior.
- **Menú lateral** sin "Nueva sesión".
- **Comprobación visual:** capturas a 1440 y 1100 px con una sesión real, más un chequeo automático de que la página no desborde.

## Tercera ronda (14-09): línea de tiempo y reproducción

- **Menús fuera de las tarjetas:** los desplegables de canales y "Acciones" se dibujan en `<body>` (`usePopoverPosition`). Se abren hacia arriba si abajo no hay lugar, y tienen scroll propio.
- **Regla de tiempo legible:** una sola línea de eje, números más grandes con su marca y líneas guía verticales detrás de los eventos.
- **Zoom y scroll lateral:**
  - Botones −, + y "Ajustar", y Ctrl + rueda para hacer zoom alrededor del cursor.
  - Las sesiones largas abren con al menos 10 px por segundo y scroll lateral.
  - Las etiquetas de los carriles quedan fijas a la izquierda.
  - Vista general con errores y avisos y un recuadro de la parte visible, que se puede arrastrar.
  - La línea de tiempo sigue al video y a la selección.
- **Fila "PETICIONES":** un círculo pequeño por tramo con cuántas peticiones HTTP se lanzaron en él, contadas en el momento en que salen (`requestLaunches`). Si en el segundo 10 salen 10 peticiones, el círculo dice 10. El tramo se adapta al zoom, respeta los filtros, la intensidad crece con la cantidad y el pico va resaltado.
- **Regla con décimas** cuando el zoom baja de 1 s por marca, para que no se repitan etiquetas como "00:00 00:00".
- **Control del video en el encabezado** (`HeaderPlayer`): retroceder o avanzar 5 s, reproducir o pausar, y el tiempo actual. Los paneles plegados se ocultan sin desmontarse, así que el video conserva su estado.

## Cuarta ronda (14-09): reglas deterministas y hallazgos (etapa 2, primera mitad)

- **Motor de reglas fijas** (`backend/src/domain/analysis/`): sin IA, corre sobre lo ya grabado y devuelve hallazgos agrupados, con severidad, evidencia (ids de eventos), ocurrencias, la acción del usuario que los precedió (hasta 3 s antes) y si caen fuera del alcance que definió el objetivo.
  - **19 reglas** en 5 categorías: red (5xx, 4xx, fallos de conexión, lentitud, duplicados, falso éxito en 2xx, respuestas pesadas), seguridad (headers faltantes, cookies sin `Secure`/`HttpOnly`/`SameSite`, credenciales en la URL, contenido mixto, tecnología expuesta), front-end (excepciones y consola, agrupadas por mensaje normalizado), tiempo real (errores de protocolo del socket, reconexiones) y rendimiento (Web Vitals contra los umbrales de Google, bloqueos largos).
  - Cada regla declara qué canal necesita (`RULE_CATALOG` en `@rastro/shared`); si no se capturó, se omite y queda listada en `skipped` con el motivo.
  - Solo evalúa el sitio que se prueba, no analytics ni CDNs de terceros (baja un nivel de severidad si no puede distinguirlos).
  - `GET /api/sessions/:id/findings`: 409 si la sesión sigue en borrador; determinista, así que no se guarda, se recalcula en cada pedido (toma ~12 ms sobre 992 eventos reales).
  - **Panel "Hallazgos"** en el detalle de sesión: pestañas por categoría, insignia de severidad, ocurrencias, recomendación y "Después de: <acción>"; un click salta al video y al inspector, igual que un punto de la línea de tiempo.
- **Cookies:** el ocultamiento ahora preserva el nombre y los atributos (`Secure`, `HttpOnly`, `SameSite`) y solo oculta el valor, para que las reglas de seguridad puedan revisarlos sin que datos sensibles lleguen a disco.
- Probado contra dos sesiones grabadas reales (992 y ~300 eventos): encontró un error real de conexión de Socket.IO (token vencido), peticiones lentas con la acción que las disparó, un CLS al límite y ruido de baja prioridad (headers de S3/Express). Verificado también con Playwright contra el backend y el frontend corriendo de verdad (no solo tests).

## Quinta ronda (14-09): confirmar o descartar un hallazgo

- **`PUT /api/sessions/:id/findings/:findingId/decision`** con `{ decision: 'confirmed' | 'dismissed' | null, note? }`; `null` limpia la decisión. Devuelve el análisis completo ya con la decisión aplicada. 404 si el hallazgo no existe en la sesión.
- Las decisiones se guardan aparte (`findings-decisions.json` por sesión, con escritura atómica) porque los hallazgos en sí no se persisten: se recalculan en cada pedido y la decisión se les aplica encima por id estable.
- **Panel "Hallazgos":** cada fila tiene "Confirmar" / "Descartar"; una vez decidido, muestra "✓ Confirmado" o "✕ Descartado" con un enlace "Deshacer". Lo descartado se oculta de la lista por defecto (sigue contando en las pestañas de categoría) y un botón "Mostrar descartados (N)" lo revuelve a mostrar, atenuado.
- Verificado con Playwright contra el backend y el frontend reales: confirmar y descartar funcionan, la decisión sobrevive a recargar la página (no es solo caché del cliente) y el toggle de descartados funciona.

## Sexta ronda (14-09): accesibilidad con axe-core

- **Canal nuevo "Accesibilidad"** (activado por defecto en sesiones nuevas). Cada pantalla distinta se revisa con axe-core 4.13 unos 2 s después de navegar, también en cambios de ruta de SPA, hasta 25 por pestaña. Reglas WCAG 2.x A/AA y buenas prácticas, sin la regla `region` (demasiado ruidosa). Textos en español.
  - Corre en un **mundo aislado de CDP**: comparte el DOM con la página pero no su JavaScript, y no le afecta su CSP.
  - Genera un evento `a11y-scan` por pantalla, con las reglas que fallan, hasta 10 elementos por regla (selector, HTML recortado, cómo corregirlo y su rectángulo para futuros overlays). El HTML pasa por el ocultamiento de datos.
- **Regla `a11y-violation`**: agrupa por regla de axe entre pantallas; la severidad sale del impacto más grave (crítico → alto, grave → medio, moderado y menor → bajo). Incluye la guía de Deque.
- **Métricas limpias:** la regla de bloqueos ignora los long tasks que caen durante la propia revisión de axe.
- **UI:** la revisión aparece en el carril PANTALLAS ("Accesibilidad: N problemas", en ámbar si hay impacto crítico o grave) y el inspector muestra cada regla con sus elementos. El panel de hallazgos tiene la pestaña "Accesibilidad".
- Las sesiones grabadas antes no tienen el canal: la regla aparece en "Sin evaluar" con el motivo.
- **Bug corregido (existía desde la etapa 1):** la pestaña principal se instrumentaba dos veces en paralelo y la navegación inicial arrancaba antes de conectar los colectores. **Se perdían la request del documento y los recursos de la primera carga.** Ahora ambas llamadas esperan la misma instrumentación; la prueba de humo lo verifica.
- Prueba de humo: 16/16 (se sumaron la carga inicial y tres chequeos de accesibilidad con Chromium real).
- **Ajustes tras la primera sesión real (10 hallazgos):**
  - La traducción al español de axe-core 4.13 no trae 25 reglas (quedaban en inglés, p. ej. `select-name`) y parte de sus textos usa un formato de plantilla viejo que axe ya no procesa (`{{~it:value}}`). `A11Y_RULES_ES` (en `@rastro/shared`) completa las 25 reglas y `cleanAxeText` quita los restos. Se aplica al grabar y también al mostrar, así que corrige las sesiones ya grabadas. Quedan en inglés algunas líneas del detalle por elemento (29 mensajes internos de axe sin traducir).
  - La recomendación del hallazgo usa la descripción corta de la regla; la lista de alternativas por elemento queda en el inspector. El detalle ya no lista selectores CSS largos.
  - "Después de: Escribe en «»": una acción con etiqueta vacía ahora muestra su selector (en hallazgos y en la línea de tiempo).

## Séptima ronda (14-09): informe PDF y ticket desde un hallazgo

- **"Exportar informe PDF"** en el menú Acciones (sesiones grabadas). El backend arma el informe en HTML (todo texto escapado) y lo imprime a A4 con Chromium sin JavaScript. Incluye encabezado, resumen por severidad, objetivo y criterios, hallazgos por categoría (con recomendación, momento, acción previa, confirmados y notas del QA), descartados aparte y cobertura (reglas omitidas y por qué). Pie con número de página.
  - Se guarda en `Descargas/Rastro` (configurable con `RASTRO_REPORTS_DIR`) con un nombre estable por sesión: reexportar reemplaza el anterior. Si el PDF está abierto en otro programa, se avisa en vez de fallar en silencio.
  - Aviso en la sesión con **"Abrir PDF"** y **"Mostrar en carpeta"**: el backend usa el programa predeterminado del sistema, sin shell, y solo sobre informes que él mismo generó.
  - `POST /api/sessions/:id/report` (409 en borrador) y `POST /api/sessions/:id/report/open` (`{ reveal }`).
- **"Copiar ticket"** en los hallazgos confirmados: Markdown con severidad, contexto, cuándo ocurrió, pasos para reproducir, nota del QA y evidencia. Se pega en Jira, Linear, Azure DevOps o GitHub. La creación directa en Jira queda pendiente (necesita sitio y token del usuario).
- Etiquetas de severidad, categoría y tipo de prueba movidas a `@rastro/shared` (las usan la app y el PDF).
- Prueba de humo: 17/17, con exportación de un PDF real. Informe de la sesión real "Home coord_2": 5 páginas, 22 hallazgos, 0,6 s.

## Octava ronda (14-09): criterios evaluados por el QA y marcas de evidencia

- **Marcas durante la grabación:** "📍 Marcar" en el widget flotante y "📍 Marcar momento" en la barra de grabación. Se elige un criterio (opcional) y se escribe una nota. El momento se toma al tocar el botón, no al guardar, en el mismo reloj que los eventos.
- **Veredicto por criterio al revisar:** panel "Criterios de aceptación" con Pendiente / Cumple / No cumple / Bloqueado y una nota. Las marcas de cada criterio se abren y saltan a ese momento del video, y se pueden borrar. "📍 Marcar este momento" agrega evidencia desde el reproductor. Las marcas sin criterio quedan como "Notas sin criterio".
- Chip en el encabezado ("Criterios: X/N cumplen"). En la revisión, el panel de objetivo ya no repite la lista de criterios.
- **Informe PDF:** tarjeta "criterios cumplen", veredicto y nota por criterio con sus marcas, y sección "Notas del QA".
- Backend: `review.json` por sesión (escrituras serializadas). `GET /review`, `POST /markers`, `DELETE /markers/:id`, `PUT /criteria/:CAn`. Rechaza sesiones en borrador, criterios inexistentes y marcas vacías, y recorta la marca al final de la grabación.
- Prueba de humo: 19/19 (marca durante la grabación, veredicto e informe).

## Novena ronda (14-09): recuadros sobre el video

- **Recuadros al reproducir:** el elemento donde el usuario hizo clic o escribió (azul, con etiqueta, de 0,15 s antes a 1,5 s después) y los elementos con problemas de accesibilidad (borde rojo, naranja, ámbar o gris según el impacto; hasta 12 por pantalla, primero los más graves; la etiqueta aparece al pasar el mouse). Al hacer clic en un recuadro se abre su evento en el inspector.
- **Modo** en el encabezado del video: Siempre / Al pausar / Nunca. Se recuerda entre aperturas.
- **Proyección** (`overlay/overlays.ts`, con tests): página → cuadro del video (Chromium achica la página para que entre en el video sin superar su zoom, y la ubica arriba a la izquierda) → `<video>` con `object-fit: contain`. Verificada con la grabación real "Home coord_2": clics en el selector, el login y el chat, y la tabla marcada por axe.
- La captura ahora guarda el zoom de pantalla (`devicePixelRatio`) con cada acción, y el tamaño de la ventana con cada revisión de accesibilidad. Las sesiones anteriores funcionan igual: suponen que la página se achicó para entrar en el video (Windows al 125% dio 1536×730 en un video de 1600×900) y, para la accesibilidad, usan la ventana de la acción más cercana.
- **Límite:** el scroll no se graba, así que los rectángulos de accesibilidad valen solo para el momento de la revisión. Duran 2,5 s y se cortan en la siguiente acción o navegación.

## Décima ronda (14-09): agentes de IA (etapa 3, primer equipo)

- **Equipo:** API REST (red y WebSocket), Front-end (acciones, consola, accesibilidad y rendimiento) y QA Lead, que junta ambos informes, une lo repetido y **propone un veredicto por criterio**. Cada agente tiene su robot con color propio.
- **Cómo corre:** "Analizar con agentes" en el panel Agentes de una sesión grabada. Antes del primer análisis se explica qué datos se envían: un resumen ya ocultado, sin video. Responde enseguida y los tres agentes trabajan en segundo plano; el panel muestra el avance paso a paso. Hay un análisis a la vez por sesión, y si Rastro se reinicia a mitad, el análisis queda marcado como interrumpido.
- **OpenRouter, errores claros:** OpenRouter responde 200 enseguida y mantiene la conexión abierta mientras el modelo piensa, así que el tiempo se puede agotar mientras llega la respuesta. Eso ahora se informa como tiempo agotado (10 min, sin reintentar), no como "formato inesperado". También se detectan la saturación del proveedor (502/503), el error dentro de la respuesta, el cuerpo cortado (se reintenta) y el texto en partes. Con datos inventados, Nemotron `:free` tardó más de 3 min una vez y otra respondió "Service temporarily overloaded": los modelos gratuitos no son confiables para el análisis.
- **Reintentar retoma, no repite:** cada análisis guarda un punto de control en `agent-checkpoints/<id>.json`, con el resumen, la evidencia de cada agente, el mapa de referencias E# y los informes de los especialistas que ya respondieron. "Reintentar desde <agente>" (`POST /agents/:runId/retry`) reutiliza el mismo análisis y consulta solo a los agentes que faltan, con el mismo contexto aunque el QA haya cambiado algo entre medio. Así las referencias siguen apuntando a los mismos eventos. Los análisis sin punto de control se reintentan desde cero.
- **Evidencia verificable:** los agentes citan con referencias cortas (E1, E2…) que el backend traduce a eventos reales. Lo inventado se descarta, igual que los criterios que no existen. Cada evidencia se abre en el inspector y salta al video.
- **Resultado:** resumen del QA Lead, observaciones con los agentes que las respaldan, y la propuesta de veredicto en cada criterio con **Aceptar**, que la copia como veredicto del QA con la justificación como nota. Nada cambia hasta que el QA acepta.
- **Google Gemini** (`@google/genai` 2.22; el usuario eligió Gemini en lugar de Anthropic): modelo `gemini-2.5-pro` por defecto, configurable con `RASTRO_AGENT_MODEL` (p. ej., `gemini-2.5-flash`).
  - Respuesta en JSON con `responseJsonSchema`, generado desde los esquemas de zod y validado de nuevo al llegar.
  - Las reglas y el resumen de la sesión van primero en `systemInstruction` y son idénticos para los tres agentes: Gemini puede reutilizar ese prefijo con su caché implícita, y el panel muestra lo leído desde caché.
  - Hasta 3 intentos ante límites de uso o errores del servidor; errores de clave, permisos, modelo inexistente y cuota traducidos a mensajes claros.
  - El texto de la página grabada se trata como datos, no como instrucciones.
  - Los agentes dependen del puerto `AgentModel`: cambiar de proveedor es escribir otro adaptador.
- **OpenRouter** (para pruebas, una clave para muchos modelos): con `OPENROUTER_API_KEY`, `RASTRO_AGENT_PROVIDER=auto` lo prefiere a Gemini directo. El modelo por defecto es `google/gemini-2.5-pro`, y `gemini-2.5-pro` se traduce solo a ese nombre.
  - JSON con esquema estricto y `provider.require_parameters` para que solo respondan proveedores que respeten el formato.
  - Reintentos ante 408/429/5xx y fallas de red. Errores traducidos: clave inválida, sin saldo, modelo inexistente, límite de uso. OpenRouter también manda errores con status 200, y se detectan igual.
  - Probado con un `fetch` simulado.
- **Sin clave:** `GEMINI_API_KEY` (o `OPENROUTER_API_KEY`) en `backend/.env` activa los agentes. La clave se lee solo al crear el cliente y no forma parte de la configuración, así nunca termina en un log. Sin ella, el panel explica cómo configurarlos, sigue mostrando los análisis anteriores, y `POST /agents` responde 501.
- Rutas: `GET /api/agents/status`, `GET|POST /api/sessions/:id/agents`. Se guardan en `agents.json` por sesión.
- **Probado sin llamar a la API:** 10 tests con un modelo simulado (orquestación, caché del resumen, evidencia inventada, fallas, concurrencia, corridas interrumpidas) y la interfaz con un análisis simulado sobre "Home coord_2". **Falta una corrida real**, que necesita la clave del usuario y su consentimiento para enviar el resumen.
- Pendiente: lanzar los agentes solos al terminar de grabar (modos "Sugeridos" / "Elegir yo" del asistente) e incluir sus propuestas en el informe PDF.

## Undécima ronda (16-09): barra lateral con Hallazgos y Agentes globales

- El mockup (`design/Agentes.dc.html`) mostraba una barra lateral con Sesiones, Hallazgos, Agentes, Ambientes,
  Comparaciones y Ajustes del proyecto; en la app solo existía "Sesiones". Se agregó la barra lateral completa
  al `AppShell` compartido:
  - **`/hallazgos`**: hallazgos de todas las sesiones grabadas (reutiliza `getFindings` por sesión), sin
    descartados, agrupados por severidad con un resumen arriba. Click abre la sesión en su detalle.
  - **`/agentes`**: estado del proveedor configurado y la última corrida de agentes por sesión grabada.
  - **Ambientes, Comparaciones y Ajustes del proyecto**: visibles pero deshabilitados ("Próximamente"). No
    tienen mockup propio ni modelo de datos (el backend no tiene concepto de "proyecto" ni "ambiente" más allá
    de la etiqueta `capture.environment` de cada sesión); construirlos de verdad requiere definir antes qué son.
- Sin endpoints nuevos: ambas pantallas agregan del lado del cliente con `useQueries` sobre los endpoints
  por sesión que ya existían.
- Verificado con Playwright contra el backend y el frontend reales: navegación entre las tres rutas, estados
  vacíos correctos sin sesiones grabadas. Typecheck, lint y los 35 tests de frontend en verde.
- Se creó [`PLAN.md`](PLAN.md): checklist del proyecto por etapa, para ir marcando qué está hecho y qué falta.
- Pendiente siguiente: lanzar agentes automáticamente al terminar de grabar (paso 2 de "Próximos pasos").

## Duodécima ronda (16-09): modo "Sugeridos" automático y alineación con la visión de producto

- **Modo "Sugeridos" ya funciona:** `analysisMode: 'suggested'` dejó de estar bloqueado en `CreateSession`
  (solo `'manual'`, "Elegir yo", sigue rechazado: no hay nada que elegir todavía con 2 especialistas fijos).
  `StopRecording` ahora, si la sesión quedó `completed` y el modo es `suggested`, lanza
  `StartAgentRun.execute` sin bloquear la respuesta HTTP de "Detener grabación" (el `await` solo cubre el
  arranque, rápido; el equipo sigue analizando en segundo plano, igual que al lanzarlo a mano). Si los
  agentes no están configurados, no hace nada y no falla.
  - Frontend: la opción "Sugeridos" en el paso de captura ya no está deshabilitada, con nota explicando qué
    hace y una advertencia si se elige sin tener `GEMINI_API_KEY`/`OPENROUTER_API_KEY` configurada.
  - Tests nuevos en `recording.test.ts`: arranca solo al completar, y no falla si no hay agentes.
- **Se leyó `rastro-vision.html`** (documento de visión completo: por qué existe Rastro, comparación con
  Jam.dev/webQsee/BugReel/etc., la matriz de 12 agentes por fase QA, y las 4 etapas del MVP). No había sido
  revisado a fondo antes de esta ronda. Con eso se resolvió qué son de verdad "Ambientes" (comparar el mismo
  flujo entre DEV/QA/STG/PROD) y "Comparaciones" (regresión contra una sesión base) — antes quedaban como
  placeholders sin definición en la barra lateral. Ver [`PLAN.md`](PLAN.md), sección "Etapa 4".
- Configurado `nvidia/nemotron-3-super-120b-a12b:free` vía OpenRouter en `backend/.env` del usuario para
  probar con clave real (ya con la advertencia de que este modelo gratis no fue confiable en pruebas previas).
- Typecheck, lint y los 113+35 tests (backend+frontend) en verde.

## Decimotercera ronda (16-09): propuestas de agentes en el informe PDF

- **Sección "Análisis de agentes"** en el PDF, después de "Hallazgos": el resumen del QA Lead, la propuesta
  de veredicto por criterio (con confianza y justificación, aclarando que es una propuesta sin aplicar —
  el veredicto real sigue siendo el que decidió el QA en "Objetivo") y las observaciones de los agentes con
  quién las respalda. Solo aparece si hay una corrida de agentes **terminada**; sin agentes o con corridas
  fallidas/en curso, el informe queda igual que antes.
  - `ExportSessionReport` ahora también lee `AgentRunStore` y elige la corrida completada más reciente.
  - `SessionReportData` (dominio) suma `latestAgentRun: AgentRun | null`.
- Tests nuevos en `reportHtml.test.ts` (sin sección cuando no hay corrida; con resumen, propuesta y
  observación cuando sí la hay) y prueba de humo real (20/20, PDF de 93 KB con 8 hallazgos).

## Decimocuarta ronda (16-09): catálogo de 12 agentes, vista previa del equipo y arreglos de UI

- **Corrida real confirmada:** con la clave de OpenRouter del usuario, se grabó una sesión de prueba en
  modo "Sugeridos" de punta a punta (Playwright contra la app real): al detener la grabación, el agente
  `api` arrancó solo contra `nvidia/nemotron-3-super-120b-a12b:free`. La corrida quedó interrumpida por un
  reinicio del backend (hot-reload durante el desarrollo, no un fallo del modo), y es retomable con
  "Reintentar" gracias al punto de control existente.
- **Catálogo de 12 agentes** (`AGENT_ROSTER`/`AGENT_ROSTER_ORDER` en `@rastro/shared`, separado de
  `AgentId`/`agentIdSchema` para no tocar la validación de lo que el modelo puede devolver de verdad):
  Ambiente, Funcional, API REST, Front-end, Tiempo real, Rendimiento, Seguridad, Accesibilidad, UI/UX,
  Carga, Regresión y Reportero, con rol y canales tomados de `rastro-vision.html`.
- **`/agentes` rehecha** como "Equipo de agentes": grilla de 12 tarjetas con `RosterAvatar` (robot genérico
  por color), badge "En el equipo" (los 3 reales) o "Próximamente" (los otros 9), más la lista de corridas
  por sesión que ya existía debajo.
- **"Nueva sesión" ya no queda corto respecto al diseño de agentes:** al elegir "Sugeridos" en el paso de
  captura aparece la vista previa del equipo real (avatares de API REST, Front-end y QA Lead con qué lee
  cada uno) y un enlace a "Ver el equipo completo de agentes".
- **Bug de hover corregido:** `background: #f6f7f4` (usado en filas de tablas y listas: Sesiones, Hallazgos,
  Agentes, Hallazgos por sesión, marcadores de criterios, conversación de WebSocket) es casi idéntico al
  fondo de la página (`#f1f2ef`) y al de las superficies (`#fbfbf9`), así que el hover era casi invisible.
  Reemplazado por `var(--surface-sunken)` (`#e1e5df`), el token que ya usaba el resto de la app (menú,
  botones, desplegables) para hover visible.
- **Responsividad en pantalla completa:** `Sesiones`, `Hallazgos`, `Agentes` y `Nueva sesión` tenían
  `max-width` sin centrar, así que en una ventana grande o maximizada el contenido quedaba pegado a la
  izquierda con un vacío enorme a la derecha. Se agregó `margin-inline: auto` a esas cuatro páginas.
  `Sesión` (detalle) ya usaba todo el ancho disponible y no tenía este problema.
- Typecheck, lint y los 35 tests de frontend en verde; verificado visualmente con Playwright a 1920×1080.

## Decimoquinta ronda (16-09): agentes navegables, personalidad visual y ordenar niveles de alto a bajo

- **`/agentes/:id`**: cada tarjeta del equipo abre una página de detalle por agente (`AgentDetailPage`) con
  su rol, canales que lee, un panel "Configuración" honesto (los 3 implementados explican que corren
  siempre juntos y que "Elegir yo" no existe todavía; los otros 9 dicen que no tienen prompt ni lógica
  propia, sin fingir un ajuste que no hace nada) y, para los implementados, su actividad real: en cuántas
  sesiones participaron, con qué estado y cuántos hallazgos aportaron.
- **Personalidad visual por agente:** `AgentRosterMeta` suma `eyeShape` (redondos, visor, cuadrados) y
  `animation` (parpadeo, parpadeo lento, pulso, barrido) en `@rastro/shared`. `agentVisuals.tsx`
  (`AgentEyes`) centraliza el render y las animaciones, compartido entre `AgentAvatar` (los 3 agentes que
  corren de verdad, en el panel de la sesión y en la vista previa de "Nueva sesión") y `RosterAvatar`
  (catálogo de 12). Todos "respiran" en reposo (antes solo pasaba con `busy`); al pasar a "analizando", el
  mismo movimiento se acelera en vez de cambiar a uno genérico. Los 9 agentes sin implementar quedan quietos
  a propósito (no fingen estar "vivos").
- **Niveles ordenados de mayor a menor:** `a11yImpactSchema` pasó de `minor→moderate→serious→critical` a
  `critical→serious→moderate→minor`, y `confidenceSchema` de `low→medium→high` a `high→medium→low` (con
  `CONFIDENCE_LABELS` reordenado igual). En ambos casos el orden ascendente solo vivía en la declaración del
  enum: donde ya se usaban para ordenar de verdad (`IMPACT_RANK` en las reglas de accesibilidad y en los
  overlays del video) el código ya rankeaba de alto a bajo; esto lo hace consistente también en la
  declaración. `FINDING_SEVERITIES` (`critical→high→medium→low`) ya estaba bien y no se tocó.
- Typecheck, lint y los 15+115+35 tests (shared+backend+frontend) en verde; verificado con Playwright
  contra la app real: la grilla de 12 agentes ya es navegable y `/agentes/api` muestra su actividad real
  (la corrida de prueba de la ronda anterior, con su estado y 0 hallazgos).

## Decimosexta ronda (16-09): "Elegir yo" implementado de verdad

- **`capture.selectedAgents`** (`@rastro/shared`, `specialistIdSchema`/`SPECIALIST_AGENTS`): el QA elige
  cuáles de los 2 especialistas (API REST, Front-end) corren en modo "Elegir yo"; el QA Lead siempre se
  agrega para juntar lo que encuentren. `CreateSession` rechaza `manual` sin ningún agente elegido (400).
- **`StartAgentRun`** ya no asume siempre los 2 especialistas: arma los pasos, el bucle y el prompt del QA
  Lead (`leadTask`, ahora con informes parciales) según `selectedAgents`, o el equipo completo si la sesión
  no especificó ninguno (compatibilidad con `suggested` y con sesiones grabadas antes de este cambio).
- **`StopRecording`** ahora lanza el análisis automático también en modo `manual` (antes solo en
  `suggested`): ambos modos "usan agentes", solo cambia el equipo.
- **Frontend:** "Elegir yo" dejó de estar deshabilitado; muestra checkboxes con el avatar real de cada
  especialista y una nota fija de que el QA Lead siempre se incluye, con la misma validación (elegir al
  menos uno) reflejada como error de campo antes de tocar el backend.
- Verificado con Playwright contra la app real: crear una sesión en "Elegir yo" con solo API REST marcado
  guarda `selectedAgents: ['api']` correctamente. Nota aparte: el `vite` del `dev:desktop` del usuario se
  cayó solo en medio de esta ronda (sin relación con estos cambios) y se reinició sin pérdida de trabajo.
- Tests nuevos en `agents.test.ts` (el especialista no elegido nunca se consulta) y `recording.test.ts`
  ("Elegir yo" arranca solo al completar, igual que "Sugeridos", con solo el agente elegido). 118 tests de
  backend, 35 de frontend, 15 de shared: todos en verde.

## Decimoséptima ronda (16-09): infraestructura de tests de componentes

- Se sumaron `jsdom`, `@testing-library/react` y `@testing-library/jest-dom` al frontend. `vite.config.ts`
  pasa a `environment: 'jsdom'`, incluye `*.test.tsx` y carga `src/test/setup.ts` (matchers de jest-dom).
  Hasta ahora los tests de frontend solo cubrían lógica pura (`*.test.ts`); esto habilita tests de
  componentes reales.
- Primeros ejemplos: `AppShell.test.tsx` (la navegación real tiene los `href` correctos; Ambientes/
  Comparaciones/Ajustes del proyecto no son enlaces) y `RosterAvatar.test.tsx` (cada forma de ojos dibuja
  lo que corresponde, y un agente no implementado no anima). 40 tests de frontend en verde (35 + 5 nuevos).

## Decimoctava ronda (16-09): resultado de la corrida real contra Nemotron

- Se reintentó el análisis interrumpido de la ronda 14 (`POST /agents/:runId/retry`) con la app en reposo
  (sin ediciones en paralelo). Resultado real: falló con **"La respuesta del agente quedó cortada por su
  largo"** en el especialista API REST. Es la misma falla de confiabilidad de `nvidia/nemotron-3-super-120b-a12b:free`
  ya anotada en la décima ronda — no un bug del código: la detección y el mensaje de error funcionaron
  como corresponde.
- Conclusión: el modelo gratis de OpenRouter no sirve para una corrida real completa. Para probar el equipo
  de agentes de verdad hace falta un modelo de pago — Gemini directo (`gemini-2.5-pro`/`gemini-2.5-flash`)
  con `GEMINI_API_KEY`, o un modelo no `:free` en OpenRouter.

## Decimonovena ronda (16-09): gestos de cabeza y un bug real de animaciones

- **Gestos de cabeza por agente** (`AgentGesture`: `tilt`/`turn`/`nod` en `@rastro/shared`): además de los
  ojos, cada robot inclina, gira o asiente a su propio ritmo. `AgentHead` (nuevo, en `agentVisuals.tsx`)
  envuelve la antena, la cabeza, la cara y los ojos en un `<g>` que rota/traslada; los brazos quedan afuera
  porque no deberían moverse. Mismo mecanismo que los ojos: se acelera con `.busy`, sin cambiar de tipo.
- **Bug real encontrado y corregido: ninguna animación de agentes se veía.** Vite renombra los `@keyframes`
  de un CSS Module (p. ej. `blink` → `_blink_1okyi_1`), pero el nombre de la animación de ojos y de cabeza
  se arma como texto en `agentVisuals.tsx` y se pasa por una variable CSS (`--agent-anim`, `--agent-gesture`)
  — nunca pasa por el build de Vite, así que seguía diciendo `blink` a secas. El navegador reportaba la
  animación como "corriendo" (`animationName`/`animationPlayState` se veían bien en DevTools) pero no había
  ningún `@keyframes blink` real con ese nombre: no se movía nada. Esto probablemente afectó **todas** las
  animaciones de ojos y el "bob" de las rondas anteriores, no solo los gestos nuevos.
  - Arreglo: los `@keyframes` que se referencian por nombre desde JS ahora usan `@keyframes :global(nombre)`
    (con prefijo `rastro-agent-` para no chocar con nada global), y `agentVisuals.tsx` usa esos mismos
    nombres. Verificado de verdad esta vez: se midió `getBoundingClientRect()` de un agente en vivo en el
    navegador y la posición cambia cuadro a cuadro (antes quedaba fija).
  - Las animaciones del loader de "Analizando…" (anillo de color, punto pulsante en `AgentsPanel.module.css`)
    no tenían este problema porque su `animation:` y su `@keyframes` viven estáticos en el mismo archivo CSS,
    así que Vite los renombra a los dos por igual.
- Typecheck, lint y 118+40+15 tests en verde después del arreglo.

## Vigésima ronda (16-09): loader del panel "Agentes" con anillo y punto del color del agente

- El paso "Analizando…" en el panel de una sesión (el que mostró la captura del usuario) ahora tiene un
  anillo pulsante alrededor del avatar y un punto animado junto al texto, ambos con el color propio del
  agente (`--agent-color`, tomado de `AGENT_CATALOG`), además de la fila resaltada con un tinte muy suave
  de ese mismo color mientras corre. Esto se suma al parpadeo/gesto de cabeza ya corregido arriba.

## Vigesimoprimera ronda (16-09): agente Seguridad, el cuarto que corre de verdad

- **Nuevo especialista real: Seguridad** (`sec`). Se sumó a `agentIdSchema`/`AGENT_ORDER`/`SPECIALIST_AGENTS`
  en `@rastro/shared`, con su propio prompt (reutiliza `specialistTask`, ya genérico) y un digest propio,
  `securityDigest` en `brief.ts`: headers de respuesta por origen (CSP, HSTS, X-Frame-Options, Server,
  X-Powered-By…), cookies `Set-Cookie` con sus atributos, URLs del propio sitio con parámetros que parecen
  credenciales, y contenido `http://` en una página `https://`. Es evidencia en bruto, distinta de los
  hallazgos ya resueltos por las reglas fijas (esos ya los ve todo el equipo en el resumen compartido) —
  así el agente puede razonar sobre la severidad en contexto, no repetir lo que ya está dicho.
- **Por qué solo este y no los otros 8:** Accesibilidad y Rendimiento ya están cubiertos por Front-end
  (`frontendDigest` manda axe-core y Web Vitals) y Tiempo real ya lo cubre API REST (WebSocket). Agregarlos
  aparte hoy sería un agente redundante, no uno nuevo — haría falta primero sacarle ese alcance a Front-end/
  API REST, que es un cambio de diseño aparte, no "agregar un agente que falta". Ambiente, Funcional, UI/UX,
  Carga, Regresión y Reportero sí quedan genuinamente pendientes, sin overlap con nada existente.
  Documentado en `PLAN.md` para no repetir la pregunta.
- `leadTask` y `AgentCheckpoint.digests`/`reports` ya eran genéricos por el trabajo de "Elegir yo" de una
  ronda anterior, así que sumar el cuarto agente fue extender datos (catálogo, digest, checkpoint) y no
  tocar la lógica de orquestación.
- Textos actualizados donde decían "dos especialistas" o nombraban solo API REST/Front-end (panel Agentes,
  pantalla de agentes, "Nueva sesión").
- Tests: `agents.test.ts` y `recording.test.ts` actualizados para el equipo de 3 especialistas por defecto;
  nuevo test de `securityDigest` en `brief.test.ts`. 119 tests de backend, 40 de frontend, 15 de shared, y
  prueba de humo real con Chromium (PDF incluido): todo en verde.

## Vigesimosegunda ronda (16-09): equipo de 8 especialistas, sin solaparse, que se ayudan al sintetizar

El usuario pidió separar lo que un agente ya cubría en agentes propios ("si dices que hay cosas que ya
cubre uno, entonces separalo") y sumar los que faltaban, con una condición: los agentes se pueden ayudar
entre sí, pero el alcance (scope) de cada uno debe ser independiente.

- **Se partieron los dos agentes que tenían más de un tema:**
  - Front-end tenía excepciones, consola, accesibilidad y rendimiento → se quedó con excepciones y consola;
    accesibilidad y rendimiento pasaron a ser agentes propios.
  - API REST tenía HTTP y WebSocket → se quedó con HTTP; WebSocket pasó a ser el agente Tiempo real.
- **Se sumaron dos especialistas nuevos** que no eran overlap de nada: Funcional (une cada acción del
  usuario con su consecuencia inmediata: requests, errores, cambio de pantalla, en los 2,5 s siguientes) y
  Ambiente (headers y menciones de versión/build del propio sitio).
- **Resultado: 8 especialistas + QA Lead**, cada uno con su propio digest en `brief.ts`
  (`apiDigest`, `realtimeDigest`, `frontendDigest`, `a11yDigest`, `perfDigest`, `securityDigest`,
  `funcDigest`, `envDigest`) y su propio `AgentId`. `AGENT_ORDER`/`SPECIALIST_AGENTS` pasaron de 3 a 8.
- **"Se ayudan entre sí, scope independiente":** `AGENT_SYSTEM` (el prefijo común a todos, en `prompts.ts`)
  ahora dice explícitamente que cada especialista no analiza fuera de su área, pero que si su evidencia es
  la causa o la consecuencia de algo del área de otro agente debe decirlo igual, citando su propia
  evidencia — los especialistas no se ven entre sí mientras trabajan, así que es el QA Lead quien cruza esas
  menciones al final. `leadTask` pide explícitamente unir observaciones "conectadas causalmente", no solo
  duplicadas literalmente.
- **Catálogo actualizado:** los 4 que quedan sin implementar (UI/UX, Carga, Regresión, Reportero) tienen en
  su `role` la razón puntual de por qué, sin fecha ("necesita imágenes", "genera un archivo, no analiza",
  "necesita Comparaciones de la etapa 4", "necesita las integraciones de Ajustes del proyecto").
- Reescritos `agents.test.ts` (equipo completo de 8+lead), `recording.test.ts` y `brief.test.ts` (un test
  por digest nuevo). 124 tests de backend, 40 de frontend, 15 de shared, y prueba de humo real con Chromium
  (PDF de 8 hallazgos): todo en verde. Verificado a mano en el navegador: `/agentes` muestra 9 "En el
  equipo" y 4 "Próximamente" con motivo propio; "Elegir yo" ya lista los 8 especialistas como casillas.

## Vigesimotercera ronda (16-09): Carga y Reportero, sin IA pero reales

El usuario notó que 4 agentes seguían en "Próximamente" y pidió resolverlos. Revisando cada uno: 2 de los
4 (Carga, Reportero) no necesitaban ninguna capacidad nueva — solo no encajaban en el flujo de especialista
de IA → QA Lead porque su salida no es un análisis, es un archivo. Se implementaron aparte, como acciones
determinísticas de la sesión, no como especialistas:

- **`AgentRosterMeta.capability`** (`'analysis' | 'generator'`, nuevo en `@rastro/shared`): distingue a los
  8 especialistas de IA (equipo de "Sugeridos"/"Elegir yo") de las funciones determinísticas sueltas. El
  badge en `/agentes` y `/agentes/:id` ahora dice "Disponible" para estas en vez de "En el equipo", y la
  sección "Actividad" (corridas de agentes) solo aparece para `capability: 'analysis'`.
- **Carga**: `generateK6Script` (`backend/src/application/reports/k6Script.ts`) arma un script k6 real a
  partir del tráfico HTTP del propio sitio: un request de muestra por endpoint (agrupado por método + path,
  sin query), en el orden en que se lanzaron, con un check de status 2xx/3xx y una pausa entre pasos.
  `GET /api/sessions/:id/load-script` devuelve `{ fileName, script }`; el frontend arma un Blob y dispara la
  descarga del navegador. "Descargar script de carga (k6)" en el menú Acciones, junto a "Exportar informe
  PDF". Probado contra el servidor real corriendo (no solo unit tests).
- **Reportero**: `sessionToReport` (`frontend/src/features/session-detail/sessionReport.ts`, client-side,
  igual que `findingToTicket`) arma el informe de toda la sesión en Markdown: objetivo, veredicto de cada
  criterio, hallazgos confirmados (sin los descartados) y, si hay una corrida de agentes terminada, su
  resumen y propuesta (aclarando que no está aplicada). "Copiar informe completo" en el menú Acciones.
- Quedan genuinamente bloqueados, cada uno por una razón distinta: **UI/UX** necesita mandarle imágenes al
  modelo (hoy no hay captura de pantallas ni wiring multimodal) y **Regresión** necesita "Comparaciones"
  (marcar una sesión como base y compararla contra otra, etapa 4 — requiere modelo de datos nuevo).
- Tests nuevos: `k6Script.test.ts` (backend, incluye que un tercero como analytics no aparece) y
  `sessionReport.test.ts` (frontend, incluye que los descartados no salen y que una corrida sin terminar no
  agrega su sección). 126 tests de backend, 44 de frontend, 15 de shared, y prueba de humo real con
  Chromium: todo en verde. `GET /load-script` verificado a mano contra el backend real corriendo.

## Límites conocidos

1. **Build de escritorio para distribuir:** en release, Tauri ejecuta `node backend/dist/main.js` desde el repo. Falta empaquetar el backend (Node como sidecar o un binario) junto al instalador.
2. **Desfase entre video y eventos:** el reloj de los eventos arranca antes de que abra Chromium, así que al saltar a un evento el video puede quedar corrido cerca de un segundo. Hay que marcar el instante en que empieza el video y restarlo.
3. **Una sola pestaña con video:** se graba el video de la pestaña principal. Las pestañas extra solo aportan eventos.
4. **Cierre abrupto:** si se cierra la app mientras graba, el backend se detiene de golpe y esa sesión aparece como fallida al volver a abrir.
5. **Tests del frontend:** solo cubren lógica pura (formato, modelo del formulario, línea de tiempo). No hay tests de componentes.
6. **Sin overlays sobre el video ni exportación a PDF/Jira:** eso es la segunda mitad de la etapa 2. Tampoco hay accesibilidad (axe-core) todavía.

## Estructura

Ver el [README](../README.md#estructura).

## Próximos pasos, en orden

1. **axe-core** como regla adicional de accesibilidad (falta; hoy seguridad y rendimiento ya están cubiertos por reglas fijas, accesibilidad no). Requiere correrlo dentro de la página grabada (Playwright), no solo sobre eventos ya capturados.
2. **Exportar hallazgos** a PDF y crear un ticket en Jira desde un hallazgo confirmado.
3. **Corregir el desfase entre video y eventos** cuando no viene de `videoOffsetMs` (límite 2, ya mitigado pero no eliminado del todo).
4. **Empaquetar el backend** para `tauri build` (límite 1).
5. **Etapa 3:** el primer agente de IA (orquestador QA Lead + especialistas) sobre esta misma base de hallazgos deterministas.

## Cómo retomar

Decir "retomemos Rastro desde el punto de control". Empezar por el paso 1 de "Próximos pasos".
