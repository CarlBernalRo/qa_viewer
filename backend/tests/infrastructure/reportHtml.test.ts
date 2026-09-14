import { emptyReview, type Finding, type SessionAnalysis, type SessionReview } from '@rastro/shared';
import { describe, expect, it } from 'vitest';
import { Session } from '../../src/domain/session/Session.js';
import { buildReportHtml } from '../../src/infrastructure/reports/reportHtml.js';
import { sampleInput } from '../samples.js';

function finding(overrides: Partial<Finding>): Finding {
  return {
    id: 'f1',
    ruleId: 'http-server-error',
    source: 'rule',
    category: 'network',
    severity: 'high',
    title: 'Hallazgo',
    detail: 'Detalle',
    occurrences: 1,
    firstAt: 3400,
    lastAt: 3400,
    evidence: ['e1'],
    outOfScope: false,
    ...overrides,
  };
}

function html(findings: Finding[], review: SessionReview = emptyReview()): string {
  const session = Session.create({ id: 'ses_1', now: new Date('2026-09-14T10:00:00Z'), ...sampleInput() }).toDto();
  const analysis: SessionAnalysis = {
    sessionId: 'ses_1',
    generatedAt: '2026-09-14T11:00:00.000Z',
    rulesRun: 19,
    skipped: [{ ruleId: 'a11y-violation', reason: 'No se capturó el canal de accesibilidad.' }],
    findings,
  };
  return buildReportHtml({
    session: { ...session, status: 'completed', startedAt: '2026-09-14T10:00:00.000Z', endedAt: '2026-09-14T10:04:12.000Z' },
    analysis,
    review,
    generatedAt: new Date('2026-09-14T11:00:00Z'),
  });
}

describe('informe HTML', () => {
  it('escapa los textos que vienen de la página grabada', () => {
    const output = html([finding({ title: '<script>alert(1)</script>', detail: '<img src=x onerror=alert(1)>' })]);
    expect(output).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(output).not.toContain('<script>alert');
    expect(output).not.toContain('<img src=x');
  });

  it('incluye objetivo, criterios, duración y cobertura', () => {
    const output = html([]);
    expect(output).toContain('Comprobar que un cliente pueda pagar con tarjeta');
    expect(output).toContain('<td>CA2</td>');
    expect(output).toContain('Duró 4 min 12 s');
    expect(output).toContain('Sin evaluar: Problemas de accesibilidad (WCAG) (no se capturó el canal de accesibilidad)');
    expect(output).toContain('Las reglas no encontraron nada que señalar');
  });

  it('muestra el veredicto del QA por criterio, con sus marcas y las notas sueltas', () => {
    const output = html([], {
      criteria: { CA1: { verdict: 'fail', note: 'Devuelve 500', updatedAt: '2026-09-14T10:30:00.000Z' } },
      markers: [
        { id: 'm1', t: 12_400, criterionId: 'CA1', note: 'Aparece el error', createdAt: '2026-09-14T10:01:00.000Z' },
        { id: 'm2', t: 30_000, criterionId: null, note: 'Revisar con backend', createdAt: '2026-09-14T10:02:00.000Z' },
      ],
    });
    expect(output).toContain('0/2</span><span>criterios cumplen');
    expect(output).toContain('El resultado de cada criterio lo decidió el QA (1 pendiente).');
    expect(output).toContain('>No cumple</span>');
    expect(output).toContain('<p class="crit-note">Devuelve 500</p>');
    expect(output).toContain('Marcas: 00:12.4 — Aparece el error');
    expect(output).toContain('>Pendiente</span>');
    expect(output).toContain('<h2>Notas del QA</h2>');
    expect(output).toContain('00:30.0 — Revisar con backend');
  });

  it('separa los descartados, marca los confirmados y enlaza las guías', () => {
    const output = html([
      finding({
        id: 'a',
        title: 'Confirmado por el QA',
        recommendation: 'Guía: https://dequeuniversity.com/rules/axe/4.13/image-alt',
        decision: { decision: 'confirmed', decidedAt: '2026-09-14T10:30:00.000Z', note: 'Pasa siempre' },
      }),
      finding({
        id: 'b',
        title: 'Falso positivo',
        decision: { decision: 'dismissed', decidedAt: '2026-09-14T10:31:00.000Z' },
      }),
    ]);
    const [main = '', dismissedSection = ''] = output.split('Descartados por el QA · 1');
    expect(main).toContain('Confirmado por el QA');
    expect(main).toContain('<span class="tag">Confirmado</span>');
    expect(main).toContain('Nota del QA:</strong> Pasa siempre');
    expect(main).not.toContain('Falso positivo');
    expect(dismissedSection).toContain('Falso positivo');
    expect(output).toContain('<a href="https://dequeuniversity.com/rules/axe/4.13/image-alt">');
  });
});
