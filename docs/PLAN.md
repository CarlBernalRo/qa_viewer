# Plan de Rastro

Checklist vivo del proyecto. Se actualiza a medida que se completa o se decide algo nuevo.
Para la bitácora de decisiones y detalle de cada ronda de trabajo, ver [`PUNTO_DE_CONTROL.md`](PUNTO_DE_CONTROL.md).
Para los mockups, ver `design/` (`design/canvas.json` lista las 10 pantallas).
Para la visión completa del producto (por qué existe, el hueco de mercado, la matriz de 12 agentes por
fase QA y las integraciones de la etapa 4), ver [`rastro-vision.html`](rastro-vision.html) — las etapas
de este archivo son las de ese documento de visión, no coinciden 1 a 1 con la numeración informal usada
antes en el punto de control.

## Etapa 1 · Grabar y revisar (sin IA)

- [x] Objetivo de la sesión: nombre, objetivo, criterios de aceptación, alcance, datos de prueba
- [x] Grabación con Chromium controlado (Playwright + CDP)
- [x] Captura: acciones, red REST, WebSocket/SSE, consola, rendimiento, video
- [x] Ocultamiento de datos sensibles antes de guardar (tarjetas, tokens, cookies, emails, DNI)
- [x] Línea de tiempo con zoom, filtros, vista general y fila de peticiones
- [x] Reproducción de video sincronizada con la línea de tiempo
- [x] Inspector de eventos (JSON en árbol, headers, conversación de WebSocket)
- [x] App de escritorio (Tauri): puerto y token por arranque, reinicio del backend, modo widget
- [ ] Empaquetar el backend como sidecar para `tauri build` (hoy corre `node backend/dist/main.js` desde el repo)

## Etapa 2 · Reglas fijas y hallazgos (sin IA)

- [x] Motor de reglas deterministas (19 reglas: red, seguridad, front-end, tiempo real, rendimiento)
- [x] Panel "Hallazgos" por sesión, con evidencia, ocurrencias y acción previa
- [x] Confirmar / descartar un hallazgo, con nota
- [x] Accesibilidad con axe-core (canal + regla `a11y-violation`)
- [x] Overlays sobre el video (clic/escritura y elementos con problemas de accesibilidad)
- [x] Exportar informe PDF
- [x] "Copiar ticket" en Markdown desde un hallazgo confirmado
- [x] Criterios de aceptación: veredicto por criterio y marcas de evidencia durante la grabación
- [ ] Crear ticket directo en Jira desde un hallazgo confirmado (hoy solo copiar Markdown; falta sitio y token del usuario)
- [ ] Corregir del todo el desfase entre video y eventos cuando no viene de `videoOffsetMs` (mitigado, no eliminado)

## Etapa 3 · Agentes de IA

- [x] Equipo de 3 agentes: API REST, Front-end y QA Lead (orquestador), sobre Gemini u OpenRouter
- [x] Evidencia verificable por referencias (E1, E2…) traducidas a eventos reales
- [x] Checkpoints y reintento parcial (retoma desde el agente que falta, no repite todo)
- [x] Panel "Agentes" por sesión con progreso paso a paso
- [x] Probado con modelo simulado (10 tests) y con la interfaz sobre una sesión real simulada
- [x] Lanzar agentes automáticamente al terminar de grabar: modo "Sugeridos" (`analysisMode`), corre el
      equipo fijo en segundo plano al completarse la sesión, sin bloquear la respuesta de "Detener grabación"
- [x] **Corrida real con la clave del usuario**: probado de punta a punta contra OpenRouter con
      `nvidia/nemotron-3-super-120b-a12b:free`. La integración funciona (request real, error clasificado
      bien), pero el modelo gratis cortó la respuesta del especialista API REST por longitud — la misma
      falla ya advertida antes con este modelo. Para una corrida confiable falta un modelo de pago
      (`gemini-2.5-pro`/`flash` o un modelo no-`:free` de OpenRouter).
- [x] "Elegir yo": el QA elige cuáles de los 2 especialistas corren (`capture.selectedAgents`); el QA Lead
      siempre se agrega. Arranca solo al terminar de grabar, igual que "Sugeridos". El equipo (`leadTask`,
      `AgentAvatar`, pasos de la corrida) se adapta a 1 o 2 especialistas en vez de asumir siempre ambos.
- [x] Incluir las propuestas de los agentes en el informe PDF: sección "Análisis de agentes" con el
      resumen del QA Lead, la propuesta por criterio (sin aplicar, aparte del veredicto real del QA) y
      las observaciones con los agentes que las respaldan. Solo aparece si hubo una corrida terminada.
- [x] Catálogo de los 12 agentes (`AGENT_ROSTER` en `@rastro/shared`) y pantalla `/agentes` rehecha como
      "Equipo de agentes" (grilla de 12 tarjetas: rol, canales que lee, "En el equipo" o "Próximamente").
      Solo API REST, Front-end y QA Lead corren de verdad; el resto es catálogo, sin lógica de ejecución.
- [x] Vista previa del equipo en "Nueva sesión": al elegir "Sugeridos" se ven los 3 agentes reales que van
      a correr, con enlace al panel completo de agentes.
- [x] Cada tarjeta del equipo navega a `/agentes/:id`, una página de detalle/configuración por agente: qué
      hace, qué lee, estado de configuración (real para los 3 implementados, honesto sobre qué falta para
      el resto) y, para los implementados, su actividad real across sesiones (corridas, hallazgos).
- [x] Identidad visual y animación propias por agente (`AgentRosterMeta.eyeShape`/`animation` en
      `@rastro/shared`): forma de ojos (redondos, visor, cuadrados) y tipo de movimiento en reposo
      (parpadeo, parpadeo lento, pulso, barrido) distintos por rol; se acelera igual para todos al pasar a
      "ocupado". Compartido entre `AgentAvatar` (los 3 reales) y `RosterAvatar` (catálogo de 12).
- [x] **8 especialistas reales + QA Lead**, cada uno con su propio digest y sin solaparse entre sí:
      - **API REST** (`apiDigest`): solo llamadas HTTP (antes también tenía WebSocket).
      - **Front-end** (`frontendDigest`): solo excepciones y consola (antes también tenía accesibilidad y
        rendimiento).
      - **Seguridad** (`securityDigest`): headers de respuesta, cookies y URLs con pinta de credencial.
      - **Accesibilidad** (`a11yDigest`): violaciones de axe-core por pantalla — se separó de Front-end.
      - **Rendimiento** (`perfDigest`): Web Vitals y bloqueos largos — se separó de Front-end.
      - **Tiempo real** (`realtimeDigest`): WebSocket y SSE — se separó de API REST.
      - **Funcional** (`funcDigest`): cada acción del usuario con su consecuencia inmediata (requests,
        errores, cambio de pantalla) en los 2,5 s siguientes.
      - **Ambiente** (`envDigest`): headers y menciones de versión/build del propio sitio.
      - Cada uno "corre siempre que se lanza el análisis" y aparece en "Elegir yo" (8 casillas).
      - `AGENT_SYSTEM` y `leadTask` ahora dicen explícitamente que el alcance de cada especialista es propio
        (no repetir lo de otro), pero que si su evidencia se conecta causalmente con el área de otro agente
        (un 500 de API REST que explica una excepción de Front-end) debe decirlo igual, citando su propia
        evidencia, para que el QA Lead lo cruce al sintetizar — así el equipo "se ayuda" sin invadir scope.
- [x] **Carga**: genera un script k6 real y descargable (`generateK6Script`, determinístico, sin IA) desde
      el tráfico HTTP propio de la sesión — un request de muestra por endpoint, en orden, con check y sleep.
      "Descargar script de carga (k6)" en el menú Acciones de una sesión grabada.
- [x] **Reportero**: arma el informe de toda la sesión en Markdown (`sessionToReport`, determinístico, sin
      IA) — objetivo, veredicto por criterio, hallazgos confirmados y la propuesta de los agentes si hay una
      corrida terminada. "Copiar informe completo" en el menú Acciones. No crea el ticket en la herramienta
      todavía (eso sigue necesitando las integraciones de "Ajustes del proyecto", etapa 4).
- [ ] UI/UX y Regresión siguen en catálogo, cada uno bloqueado por algo que Rastro no tiene todavía (no por
      falta de tiempo): UI/UX necesita mandarle imágenes al modelo (hoy todo es texto, no hay captura de
      pantallas ni wiring multimodal); Regresión necesita "Comparaciones" (sesión base, etapa 4). El motivo
      de cada uno está en su `role` (`AGENT_ROSTER`) y en el detalle de agente (`/agentes/:id`).

## Navegación y estructura de pantallas

El mockup (`design/canvas.json`) define 10 artboards. La app real los consolidó en 3 rutas
(`/`, `/sessions/new`, `/sessions/:id`) con paneles internos; eso sigue así, no es un pendiente.
Lo que sí faltaba y se resolvió ahora:

- [x] Barra lateral persistente (`AppShell`) con Sesiones, Hallazgos y Agentes como vistas globales reales
  - [x] `/hallazgos`: hallazgos de todas las sesiones grabadas, sin descartados, agrupados por severidad
  - [x] `/agentes`: estado del proveedor y última corrida de agentes por sesión
- [x] Ambientes, Comparaciones y Ajustes del proyecto visibles en el menú pero deshabilitados ("Próximamente"),
  con su definición real de `rastro-vision.html` en el tooltip (ver Etapa 4 abajo)

## Etapa 4 · Comparar y exportar (visión de producto, todavía sin construir)

Definiciones tomadas de `rastro-vision.html` (sección "MVP por etapas" e "Integraciones"), para no
inventar alcance cuando llegue el momento de construir esto:

- [ ] **Ambientes**: el mismo flujo grabado en DEV, QA, STG y PROD (o dos versiones), mostrando qué
      cambió en tráfico, errores y pantallas entre esas grabaciones
- [ ] **Comparaciones**: agente de Regresión — compara una sesión nueva contra una sesión base del mismo
      objetivo (tráfico nuevo, errores nuevos, cambios visuales)
- [ ] **Ajustes del proyecto**: integraciones por API directa (Jira, Azure DevOps, Linear, GitHub Issues,
      Xray, Zephyr Scale, TestRail, Qase), webhooks (Slack, Teams, Google Chat) y reglas de envío (cuándo
      sale un reporte: al cerrar sesión, al confirmar un hallazgo crítico, al cerrar el sprint)
- [ ] Exportes adicionales: script de carga k6/JMeter parametrizado desde el tráfico real, contrato OpenAPI
      inferido, servidor MCP propio de Rastro para que Claude u otros asistentes consulten sesiones

Requiere antes: concepto de "proyecto" agrupando sesiones (hoy no existe; `Environment` es solo una
etiqueta por sesión) y una sesión "base" marcable para comparar contra ella.

## Límites conocidos (no bloquean, pero hay que tenerlos presentes)

- [ ] Solo se graba video de la pestaña principal (pestañas extra solo aportan eventos)
- [ ] Sesión sin cerrar bien si la app se cierra a mitad de una grabación (aparece como fallida)
- [x] Infraestructura de tests de componentes React (`jsdom` + Testing Library) y primeros ejemplos
      (`AppShell`, `RosterAvatar`); sigue habiendo mucha lógica de UI sin cubrir, pero ya no falta la
      infraestructura para escribirlos
- [ ] Overlays de accesibilidad solo valen para el momento de la revisión (el scroll no se graba)

## Cómo retomar

Decir "retomemos Rastro" y revisar qué casillas quedan sin marcar en este archivo, empezando por
Etapa 3 (agentes de IA), que es el frente activo.
