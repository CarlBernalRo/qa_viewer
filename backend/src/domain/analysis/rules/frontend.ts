import { clip, groupBy, times, type FindingDraft, type Rule } from '../rule.js';

/** Quita lo que cambia entre repeticiones (URLs, ids, números) para agrupar mensajes iguales. */
export function messageKey(text: string): string {
  return text
    .replace(/https?:\/\/\S+/g, '<url>')
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<id>')
    .replace(/\d+/g, '#')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
}

/** Primera línea "at …" del stack: dónde se lanzó. */
function firstFrame(stack: string | undefined): string | undefined {
  const line = stack?.split('\n').find((row) => /^\s*at\s/.test(row));
  return line?.trim().replace(/^at\s+/, '');
}

export const uncaughtException: Rule = {
  id: 'uncaught-exception',
  run(evidence) {
    const groups = groupBy(evidence.ofKind('exception'), (event) => messageKey(event.message));
    return [...groups].flatMap(([key, events]): FindingDraft[] => {
      const [first] = events;
      if (!first) return [];
      const frame = firstFrame(first.stack);
      return [
        {
          severity: 'high',
          key,
          title: `Excepción: ${clip(first.message)}`,
          ...(frame ? { subject: clip(frame, 120) } : {}),
          detail: `Se lanzó ${times(events.length)}.${frame ? ` Primera línea del stack: ${clip(frame, 160)}.` : ''}`,
          recommendation:
            'Abre el stack en el inspector: la primera línea que apunta al código de la app suele ser la causa. Revisa también qué quedó en pantalla.',
          evidence: events,
        },
      ];
    });
  },
};

function consoleRule(id: 'console-error' | 'console-warning', level: 'error' | 'warn'): Rule {
  return {
    id,
    run(evidence) {
      const messages = evidence.ofKind('console').filter((event) => event.level === level);
      return [...groupBy(messages, (event) => messageKey(event.text))].flatMap(([key, events]): FindingDraft[] => {
        const [first] = events;
        if (!first) return [];
        return [
          {
            severity: level === 'error' ? 'medium' : 'low',
            key,
            title: `${level === 'error' ? 'Error' : 'Advertencia'} en consola: ${clip(first.text)}`,
            ...(first.source ? { subject: clip(first.source, 120) } : {}),
            detail: `Apareció ${times(events.length)}.`,
            ...(level === 'error'
              ? {
                  recommendation:
                    'Si coincide con algo que el usuario vio fallar, adjúntalo al bug. Si no, igual conviene que lo revise el equipo de front.',
                }
              : {}),
            evidence: events,
          },
        ];
      });
    },
  };
}

export const consoleError = consoleRule('console-error', 'error');
export const consoleWarning = consoleRule('console-warning', 'warn');

export const FRONTEND_RULES: readonly Rule[] = [uncaughtException, consoleError, consoleWarning];
