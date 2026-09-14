import { formatMs, times, type FindingDraft, type Rule } from '../rule.js';

type VitalName = 'LCP' | 'INP' | 'CLS';

interface VitalLimits {
  good: number;
  poor: number;
  format: (value: number) => string;
  describe: (value: string, good: string) => string;
  recommendation: string;
}

/** Umbrales de Google: hasta `good` está bien; por encima de `poor` es malo. */
const VITALS: Record<VitalName, VitalLimits> = {
  LCP: {
    good: 2500,
    poor: 4000,
    format: formatMs,
    describe: (value, good) => `Lo principal de la pantalla tardó ${value} en verse (bueno: hasta ${good}).`,
    recommendation:
      'Revisa qué es el elemento principal (imagen, fuente, respuesta de la API) y si se puede cargar antes o más liviano.',
  },
  INP: {
    good: 200,
    poor: 500,
    format: formatMs,
    describe: (value, good) => `La página tardó ${value} en responder a una interacción (bueno: hasta ${good}).`,
    recommendation: 'Busca trabajo pesado de JavaScript después del click: renders grandes, cálculos o listeners lentos.',
  },
  CLS: {
    good: 0.1,
    poor: 0.25,
    format: (value) => value.toFixed(2).replace('.', ','),
    describe: (value, good) => `El diseño se movió ${value} mientras cargaba (bueno: hasta ${good}).`,
    recommendation: 'Reserva espacio para imágenes, anuncios y contenido que llega tarde, así la pantalla no salta.',
  },
};

export const poorWebVital: Rule = {
  id: 'poor-web-vital',
  run(evidence) {
    const vitals = evidence.ofKind('web-vital');
    return (Object.keys(VITALS) as VitalName[]).flatMap((name): FindingDraft[] => {
      const limits = VITALS[name];
      // La peor medición va primero: es la evidencia principal.
      const over = vitals
        .filter((event) => event.name === name && event.value > limits.good)
        .sort((a, b) => b.value - a.value);
      const [worst] = over;
      if (!worst) return [];
      const poor = worst.value > limits.poor;
      const value = limits.format(worst.value);
      return [
        {
          severity: poor ? 'high' : 'medium',
          key: name,
          title: `${name} ${poor ? 'malo' : 'necesita mejorar'}: ${value}`,
          subject: name,
          detail: `${limits.describe(value, limits.format(limits.good))}${over.length > 1 ? ` Pasó el umbral ${times(over.length)}.` : ''}`,
          recommendation: limits.recommendation,
          evidence: over,
        },
      ];
    });
  },
};

const LONG_TASK_MS = 200;

export const longTask: Rule = {
  id: 'long-task',
  run(evidence) {
    // La revisión de accesibilidad también ocupa el hilo principal: esos bloqueos son de Rastro, no de la app.
    const scans = evidence.ofKind('a11y-scan');
    const duringScan = (t: number) => scans.some((scan) => t >= scan.t - scan.durationMs && t <= scan.t + 1000);
    const tasks = evidence
      .ofKind('web-vital')
      .filter((event) => event.name === 'long-task' && event.value >= LONG_TASK_MS && !duringScan(event.t));
    if (tasks.length === 0) return [];
    const longest = Math.max(...tasks.map((task) => task.value));
    const total = tasks.reduce((sum, task) => sum + task.value, 0);
    return [
      {
        severity: longest >= 1000 ? 'high' : longest >= 500 ? 'medium' : 'low',
        key: 'long-task',
        title:
          tasks.length === 1
            ? `Un bloqueo de la página de ${formatMs(longest)}`
            : `${tasks.length} bloqueos de la página de 200 ms o más`,
        detail: `El más largo duró ${formatMs(longest)}; en total, la interfaz estuvo congelada ${formatMs(total)}.`,
        recommendation:
          'Mira qué pasaba en ese momento en la línea de tiempo: suele coincidir con una respuesta grande que se procesa o con un render pesado.',
        evidence: tasks,
      },
    ];
  },
};

export const PERFORMANCE_RULES: readonly Rule[] = [poorWebVital, longTask];
