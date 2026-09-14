import { useState } from 'react';
import { cx } from '../../shared/lib/cx';
import { formatClock } from '../../shared/lib/format';
import { InfoTip, Panel, SegmentedControl } from '../../shared/ui';
import styles from './SessionDetail.module.css';
import type { TimelineItem } from './timeline/buildTimeline';
import type { Problem } from './timeline/filterTimeline';

interface ProblemsPanelProps {
  errors: Problem[];
  warnings: Problem[];
  selectedId: string | null;
  activeIds: ReadonlySet<string>;
  onSelect: (item: TimelineItem) => void;
}

type Tab = 'errors' | 'warnings';

/** Errores y avisos separados: responde "¿cuál es el error?" con un click. */
export function ProblemsPanel({ errors, warnings, selectedId, activeIds, onSelect }: ProblemsPanelProps) {
  const [tab, setTab] = useState<Tab>(errors.length > 0 || warnings.length === 0 ? 'errors' : 'warnings');
  const list = tab === 'errors' ? errors : warnings;

  return (
    <div id="problemas">
      <Panel
        collapsibleKey="problems"
        title="Errores y avisos"
        subtitle={`${errors.length} errores · ${warnings.length} avisos`}
        actions={
          <InfoTip label="Qué es un error y qué es un aviso">
            Error: respuesta 5xx, request fallida, excepción, console.error o un error de conexión de Socket.IO. Aviso:
            respuesta 4xx, request cancelada, console.warn o una métrica de rendimiento fuera de umbral.
          </InfoTip>
        }
        padded={false}
      >
        <div className={styles.problemTabs}>
          <SegmentedControl<Tab>
            ariaLabel="Tipo de problema"
            options={[
              { value: 'errors', label: `Errores (${errors.length})` },
              { value: 'warnings', label: `Avisos (${warnings.length})` },
            ]}
            value={tab}
            onChange={setTab}
          />
        </div>
        {list.length === 0 ? (
          <p className={cx(styles.muted, styles.pad)}>
            {tab === 'errors' ? 'No hubo errores en esta sesión.' : 'No hubo avisos en esta sesión.'}
          </p>
        ) : (
          <ul className={styles.problems}>
            {list.map((problem) => (
              <li key={problem.id}>
                <button
                  type="button"
                  className={cx(
                    styles.problem,
                    problem.eventId === selectedId && styles.problemSelected,
                    activeIds.has(problem.id) && styles.problemActive,
                  )}
                  onClick={() => onSelect(problem)}
                >
                  <span className={cx(styles.severity, styles[problem.severity])}>
                    {problem.severity === 'error' ? 'Error' : 'Aviso'}
                  </span>
                  <span className={styles.problemTime}>{formatClock(problem.start)}</span>
                  <span className={styles.problemLane}>{problem.laneLabel.toLowerCase()}</span>
                  <span className={styles.problemLabel} title={problem.label}>
                    {problem.label}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
