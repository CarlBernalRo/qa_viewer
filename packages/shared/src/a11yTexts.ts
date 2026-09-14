import { cleanAxeText, type A11yViolation } from './events.js';

interface RuleText {
  help: string;
  description: string;
}

/**
 * Reglas de axe-core 4.13 que su traducción al español no trae (quedaban en inglés).
 * El escáner las suma al idioma de axe y la interfaz las usa para sesiones ya grabadas.
 */
export const A11Y_RULES_ES: Readonly<Record<string, RuleText>> = {
  'aria-braille-equivalent': {
    help: 'Los atributos braille de ARIA deben tener un equivalente no braille',
    description: 'Garantiza que aria-braillelabel y aria-brailleroledescription tengan un equivalente no braille',
  },
  'aria-command-name': {
    help: 'Los botones, enlaces y elementos de menú de ARIA deben tener un nombre accesible',
    description: 'Garantiza que cada botón, enlace y elemento de menú de ARIA tenga un nombre accesible',
  },
  'aria-conditional-attr': {
    help: 'Los atributos ARIA deben usarse como indica la especificación para el rol del elemento',
    description: 'Garantiza que los atributos ARIA se usen según lo especificado para el rol del elemento',
  },
  'aria-deprecated-role': {
    help: 'No se deben usar roles ARIA obsoletos',
    description: 'Garantiza que los elementos no usen roles ARIA obsoletos',
  },
  'aria-dialog-name': {
    help: 'Los diálogos de ARIA deben tener un nombre accesible',
    description: 'Garantiza que cada diálogo y alertdialog de ARIA tenga un nombre accesible',
  },
  'aria-meter-name': {
    help: 'Los medidores de ARIA deben tener un nombre accesible',
    description: 'Garantiza que cada elemento con rol meter tenga un nombre accesible',
  },
  'aria-progressbar-name': {
    help: 'Las barras de progreso de ARIA deben tener un nombre accesible',
    description: 'Garantiza que cada elemento con rol progressbar tenga un nombre accesible',
  },
  'aria-prohibited-attr': {
    help: 'Los elementos solo deben usar atributos ARIA permitidos',
    description: 'Garantiza que no se usen atributos ARIA prohibidos para el rol del elemento',
  },
  'aria-roledescription': {
    help: 'aria-roledescription solo debe usarse en elementos con un rol semántico',
    description: 'Garantiza que aria-roledescription se use solo en elementos con un rol implícito o explícito',
  },
  'aria-tab-name': {
    help: 'Las pestañas de ARIA deben tener un nombre accesible',
    description: 'Garantiza que cada elemento con rol tab tenga un nombre accesible',
  },
  'aria-text': {
    help: 'Los elementos con role="text" no deben tener descendientes enfocables',
    description: 'Garantiza que role="text" se use solo en elementos sin descendientes enfocables',
  },
  'aria-tooltip-name': {
    help: 'Los tooltips de ARIA deben tener un nombre accesible',
    description: 'Garantiza que cada elemento con rol tooltip tenga un nombre accesible',
  },
  'aria-treeitem-name': {
    help: 'Los elementos de árbol de ARIA deben tener un nombre accesible',
    description: 'Garantiza que cada elemento con rol treeitem tenga un nombre accesible',
  },
  'empty-table-header': {
    help: 'Los encabezados de tabla no deben estar vacíos',
    description: 'Garantiza que los encabezados de tabla tengan texto discernible',
  },
  'frame-focusable-content': {
    help: 'Los marcos con contenido enfocable no deben tener tabindex="-1"',
    description: 'Garantiza que los elementos frame e iframe con contenido enfocable no tengan tabindex="-1"',
  },
  'identical-links-same-purpose': {
    help: 'Los enlaces con el mismo nombre deben tener un propósito similar',
    description: 'Garantiza que los enlaces con el mismo nombre accesible lleven a destinos con un propósito similar',
  },
  'landmark-no-duplicate-main': {
    help: 'El documento no debe tener más de un punto de referencia main',
    description: 'Garantiza que el documento tenga como máximo un punto de referencia main',
  },
  'meta-refresh-no-exceptions': {
    help: 'No se debe recargar la página automáticamente con retraso',
    description: 'Garantiza que no se use <meta http-equiv="refresh"> para recargar o redirigir la página con retraso',
  },
  'nested-interactive': {
    help: 'Los controles interactivos no deben estar anidados',
    description:
      'Garantiza que no haya controles interactivos dentro de otros: los lectores de pantalla no siempre los anuncian y el foco se vuelve confuso',
  },
  'no-autoplay-audio': {
    help: 'Los elementos de audio o video no deben reproducir sonido automáticamente',
    description:
      'Garantiza que el audio no suene solo durante más de 3 segundos sin un control para pausarlo o silenciarlo',
  },
  'presentation-role-conflict': {
    help: 'Los elementos decorativos deben ser ignorados por los lectores de pantalla',
    description:
      'Garantiza que los elementos con role="none" o role="presentation" no tengan atributos ARIA globales ni tabindex',
  },
  'select-name': {
    help: 'Los elementos select deben tener un nombre accesible',
    description: 'Garantiza que cada elemento select tenga un nombre accesible',
  },
  'summary-name': {
    help: 'Los elementos summary deben tener texto discernible',
    description: 'Garantiza que cada elemento summary tenga texto discernible',
  },
  'svg-img-alt': {
    help: 'Los SVG con rol de imagen deben tener un texto alternativo',
    description: 'Garantiza que los SVG con rol img, graphics-document o graphics-symbol tengan un texto accesible',
  },
  'target-size': {
    help: 'Los objetivos táctiles deben medir al menos 24 px o tener espacio suficiente alrededor',
    description: 'Garantiza que los objetivos táctiles tengan tamaño y separación suficientes',
  },
};

/** Texto de la regla en español: la traducción propia si axe no la trae, y siempre sin restos de plantilla. */
export function a11yRuleText(violation: Pick<A11yViolation, 'id' | 'help' | 'description'>): RuleText {
  return (
    A11Y_RULES_ES[violation.id] ?? {
      help: cleanAxeText(violation.help),
      description: cleanAxeText(violation.description),
    }
  );
}
