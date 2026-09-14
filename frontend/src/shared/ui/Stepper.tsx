import { Fragment } from 'react';
import { cx } from '../lib/cx';
import styles from './Stepper.module.css';

interface StepperProps {
  steps: readonly string[];
  current: number;
}

export function Stepper({ steps, current }: StepperProps) {
  return (
    <ol className={styles.stepper} aria-label="Pasos">
      {steps.map((label, index) => {
        const state = index < current ? 'done' : index === current ? 'current' : 'pending';
        return (
          <Fragment key={label}>
            {index > 0 && <li aria-hidden="true" className={cx(styles.line, index <= current && styles.lineDone)} />}
            <li className={cx(styles.step, styles[state])} aria-current={state === 'current' ? 'step' : undefined}>
              <span className={styles.marker}>{state === 'done' ? '✓' : index + 1}</span>
              <span>{label}</span>
            </li>
          </Fragment>
        );
      })}
    </ol>
  );
}
