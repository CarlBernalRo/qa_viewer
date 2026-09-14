import { a11yRuleText, cleanAxeText, type A11yImpact, type CaptureEventOf } from '@rastro/shared';
import { cx } from '../../../shared/lib/cx';
import { formatDuration } from '../../../shared/lib/format';
import styles from './A11yScanDetail.module.css';

const IMPACT_LABELS: Record<A11yImpact, string> = {
  critical: 'Crítico',
  serious: 'Grave',
  moderate: 'Moderado',
  minor: 'Menor',
};

/** Resultado de axe-core para una pantalla: cada regla que falla con sus elementos. */
export function A11yScanDetail({ scan }: { scan: CaptureEventOf<'a11y-scan'> }) {
  const count = scan.violations.length;
  return (
    <div className={styles.scan}>
      <p className={styles.url}>{scan.url}</p>
      <p className={styles.summary}>
        {count === 0 ? 'axe-core no encontró problemas en esta pantalla' : `${count} ${count === 1 ? 'regla con problemas' : 'reglas con problemas'}`}
        {` · ${scan.passes} reglas cumplidas · revisada en ${formatDuration(scan.durationMs)}`}
      </p>
      {count > 0 && (
        <ul className={styles.list}>
          {scan.violations.map((violation) => (
            <li key={violation.id} className={styles.violation}>
              <div className={styles.head}>
                <span className={cx(styles.impact, styles[violation.impact ?? 'minor'])}>
                  {violation.impact ? IMPACT_LABELS[violation.impact] : 'Sin impacto'}
                </span>
                <span className={styles.help}>{a11yRuleText(violation).help}</span>
              </div>
              <p className={styles.meta}>
                {violation.id} · {violation.nodeCount} {violation.nodeCount === 1 ? 'elemento' : 'elementos'}
              </p>
              <ul className={styles.nodes}>
                {violation.nodes.map((node) => (
                  <li key={node.target}>
                    <code className={styles.target}>{node.target}</code>
                    {node.summary && <p className={styles.nodeSummary}>{cleanAxeText(node.summary)}</p>}
                  </li>
                ))}
              </ul>
              {violation.nodeCount > violation.nodes.length && (
                <p className={styles.meta}>Y {violation.nodeCount - violation.nodes.length} más.</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
