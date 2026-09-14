import { Button, TextInput } from '../../shared/ui';
import styles from './NewSession.module.css';

interface CriteriaEditorProps {
  id: string;
  criteria: string[];
  onChange: (criteria: string[]) => void;
  invalid?: boolean;
  describedBy?: string | undefined;
}

/** Lista editable de criterios de aceptación; los ids CA1…CAn se asignan solos. */
export function CriteriaEditor({ id, criteria, onChange, invalid, describedBy }: CriteriaEditorProps) {
  const update = (index: number, value: string) =>
    onChange(criteria.map((item, i) => (i === index ? value : item)));
  const remove = (index: number) => onChange(criteria.filter((_, i) => i !== index));

  return (
    <div className={styles.criteria}>
      {criteria.map((text, index) => (
        <div key={index} className={styles.criterion}>
          <span className={styles.criterionId}>CA{index + 1}</span>
          <TextInput
            id={index === 0 ? id : undefined}
            value={text}
            placeholder="Ej.: Si el cobro falla, el usuario ve un error y no se crea el pedido."
            onChange={(event) => update(index, event.target.value)}
            invalid={invalid && !text.trim()}
            aria-describedby={describedBy}
            aria-label={`Criterio CA${index + 1}`}
          />
          <Button
            variant="ghost"
            aria-label={`Quitar CA${index + 1}`}
            disabled={criteria.length === 1}
            onClick={() => remove(index)}
          >
            ×
          </Button>
        </div>
      ))}
      <Button variant="ghost" onClick={() => onChange([...criteria, ''])} disabled={criteria.length >= 30}>
        + Agregar criterio
      </Button>
    </div>
  );
}
