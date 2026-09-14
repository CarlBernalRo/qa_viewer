import { a11yRuleText, type A11yImpact, type A11yViolation, type CaptureEventOf, type FindingSeverity } from '@rastro/shared';
import { clip, distinct, groupBy, type FindingDraft, type Rule } from '../rule.js';

const IMPACT_SEVERITY: Record<A11yImpact, FindingSeverity> = {
  critical: 'high',
  serious: 'medium',
  moderate: 'low',
  minor: 'low',
};

const IMPACT_LABELS: Record<A11yImpact, string> = {
  critical: 'crítico',
  serious: 'grave',
  moderate: 'moderado',
  minor: 'menor',
};

const IMPACT_RANK: Record<A11yImpact, number> = { critical: 0, serious: 1, moderate: 2, minor: 3 };

interface Hit {
  scan: CaptureEventOf<'a11y-scan'>;
  violation: A11yViolation;
}

const plural = (count: number, singular: string, pluralForm: string) =>
  `${count} ${count === 1 ? singular : pluralForm}`;

/** Una regla de axe-core que falla, agrupada entre todas las pantallas revisadas. */
export const a11yViolation: Rule = {
  id: 'a11y-violation',
  run(evidence) {
    const hits: Hit[] = evidence
      .ofKind('a11y-scan')
      .flatMap((scan) => scan.violations.map((violation) => ({ scan, violation })));
    return [...groupBy(hits, (hit) => hit.violation.id)].flatMap(([axeRule, group]): FindingDraft[] => {
      const [first] = group;
      if (!first) return [];
      const worst = group
        .flatMap((hit) => (hit.violation.impact ? [hit.violation.impact] : []))
        .sort((a, b) => IMPACT_RANK[a] - IMPACT_RANK[b])[0];
      const elements = Math.max(1, group.reduce((sum, hit) => sum + hit.violation.nodeCount, 0));
      const screens = distinct(group.map((hit) => hit.scan.url));
      const firstTarget = first.violation.nodes[0]?.target;
      // La descripción de axe dice qué pide la regla en una frase; el detalle por elemento
      // (largo, con todas las alternativas) queda en el inspector.
      const text = a11yRuleText(first.violation);
      const description = text.description.replace(/[.:;]?$/, '.');
      return [
        {
          severity: worst ? IMPACT_SEVERITY[worst] : 'low',
          key: axeRule,
          title: clip(text.help, 120),
          ...(firstTarget ? { subject: clip(firstTarget, 120) } : {}),
          detail:
            `${plural(elements, 'elemento', 'elementos')} en ${plural(screens.length, 'pantalla', 'pantallas')}.` +
            `${worst ? ` Impacto ${IMPACT_LABELS[worst]}` : ''} (regla ${axeRule} de axe-core).`,
          recommendation: `${description === '.' ? '' : `${description} `}Guía: ${first.violation.helpUrl}`,
          evidence: distinct(group.map((hit) => hit.scan)),
          occurrences: elements,
          urls: screens,
        },
      ];
    });
  },
};

export const ACCESSIBILITY_RULES: readonly Rule[] = [a11yViolation];
