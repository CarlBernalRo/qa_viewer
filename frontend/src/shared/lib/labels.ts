import type { CaptureChannel, CaptureEventKind, Environment, RedactionPreset, TestType } from '@rastro/shared';

// Compartidas con el backend (el informe PDF usa las mismas).
export { FINDING_CATEGORY_LABELS, FINDING_SEVERITY_LABELS, TEST_TYPE_LABELS } from '@rastro/shared';

interface ChannelMeta {
  label: string;
  description: string;
  /** Explicación larga para el tooltip. */
  info: string;
  color: string;
}

export const CHANNEL_META: Record<CaptureChannel, ChannelMeta> = {
  actions: {
    label: 'Acciones y DOM',
    description: 'Clicks, textos, formularios y cambios de página',
    info: 'Registra cada click, lo que escribes (las contraseñas quedan ocultas), los envíos de formularios y los cambios de página, con el lugar exacto del elemento en pantalla.',
    color: 'var(--ch-actions)',
  },
  network: {
    label: 'Red REST',
    description: 'Requests, respuestas y tiempos',
    info: 'Guarda cada request HTTP: método, URL, status, cuánto tardó, headers y el cuerpo de las respuestas JSON o de texto. Imágenes, estilos y scripts se registran sin cuerpo.',
    color: 'var(--ch-network)',
  },
  websocket: {
    label: 'WebSocket y SSE',
    description: 'Mensajes en tiempo real',
    info: 'Guarda los mensajes que la página envía y recibe por WebSocket o Server-Sent Events: chats, notificaciones, estados que se actualizan solos.',
    color: 'var(--ch-websocket)',
  },
  console: {
    label: 'Consola',
    description: 'Logs, advertencias y errores de JavaScript',
    info: 'Guarda console.log, console.warn, console.error y las excepciones de JavaScript que nadie capturó. Suele ser la pista más directa de un error en el front.',
    color: 'var(--ch-console)',
  },
  performance: {
    label: 'Rendimiento',
    description: 'Web Vitals y bloqueos de la página',
    info: 'Mide LCP (cuánto tarda en verse lo principal), CLS (cuánto salta el diseño), INP (qué tan rápido responde a un click) y las tareas largas que congelan la página.',
    color: 'var(--ch-performance)',
  },
  accessibility: {
    label: 'Accesibilidad',
    description: 'Revisión WCAG de cada pantalla con axe-core',
    info: 'Cada vez que cambias de pantalla, Rastro la revisa con axe-core, el motor de las principales herramientas de accesibilidad: textos alternativos, contraste, etiquetas de formularios, nombres de botones y enlaces. Tarda un instante y no modifica la página.',
    color: 'var(--ch-accessibility)',
  },
  video: {
    label: 'Grabación de pantalla',
    description: 'Video de la pestaña principal',
    info: 'Graba la pestaña principal para ver después exactamente qué pasó. Al tocar un evento de la línea de tiempo, el video salta a ese momento.',
    color: 'var(--ch-video)',
  },
  screenshots: {
    label: 'Capturas de pantalla',
    description: 'Una imagen por cada pantalla distinta',
    info: 'Guarda una captura de cada pantalla distinta que se visitó, para que el agente UI/UX la revise como evidencia visual.',
    color: 'var(--ch-video)',
  },
};

export const PRESET_META: Record<RedactionPreset, { label: string; description: string }> = {
  'card-numbers': { label: 'Números de tarjeta', description: 'Números de tarjeta válidos, CVV y vencimiento' },
  'tokens-cookies': {
    label: 'Tokens y cookies',
    description: 'Authorization, cookies y tokens en la URL o en el JSON (access_token, password…)',
  },
  emails: { label: 'Emails', description: 'Cualquier dirección de correo' },
  'national-ids': { label: 'DNI y teléfonos', description: 'DNI con puntos (12.345.678) y teléfonos con prefijo (+54…)' },
};

export const TEST_TYPE_DESCRIPTIONS: Record<TestType, string> = {
  funcional: 'Comprueba que una función hace lo que dice la historia o el requisito.',
  regresion: 'Vuelve a probar algo que ya funcionaba, después de un cambio, para confirmar que no se rompió.',
  humo: 'Recorrido rápido por lo esencial para decidir si la versión está lista para probarse a fondo.',
  exploratoria: 'Navegas sin guion para descubrir fallos que nadie anticipó.',
  'no-funcional': 'Rendimiento, seguridad, accesibilidad u otras cualidades que no son una función concreta.',
};

export const ENVIRONMENTS: readonly Environment[] = ['DEV', 'QA', 'STG', 'PROD'];

export const ENVIRONMENT_DESCRIPTIONS: Record<Environment, string> = {
  DEV: 'Desarrollo',
  QA: 'Pruebas',
  STG: 'Preproducción (staging)',
  PROD: 'Producción',
};

export const EVENT_KIND_LABELS: Record<CaptureEventKind, string> = {
  navigation: 'Navegación',
  'user-action': 'Acción del usuario',
  'http-request': 'Request HTTP',
  'http-response': 'Respuesta HTTP',
  'http-finished': 'Request terminada',
  'http-failed': 'Request fallida',
  'ws-open': 'WebSocket abierto',
  'ws-frame': 'Frame de WebSocket',
  'ws-close': 'WebSocket cerrado',
  'sse-message': 'Mensaje SSE',
  console: 'Consola',
  exception: 'Excepción',
  'web-vital': 'Métrica de rendimiento',
  'a11y-scan': 'Revisión de accesibilidad',
  screenshot: 'Captura de pantalla',
};
