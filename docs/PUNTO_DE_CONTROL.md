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
