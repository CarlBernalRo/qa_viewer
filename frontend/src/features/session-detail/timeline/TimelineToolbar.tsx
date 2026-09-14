import { CheckboxMenu, IconSearch, SegmentedControl } from '../../../shared/ui';
import type { LaneId, TimelineModel } from './buildTimeline';
import { ALL_LANES, DEFAULT_FILTERS, isDefaultFilters, type SeverityFilter, type TimelineFilters } from './filterTimeline';
import styles from './Timeline.module.css';

interface TimelineToolbarProps {
  model: TimelineModel;
  filters: TimelineFilters;
  errorCount: number;
  warningCount: number;
  onChange: (filters: TimelineFilters) => void;
}

/** Filtros de la línea de tiempo: canales (desplegable) y severidad. */
export function TimelineToolbar({ model, filters, errorCount, warningCount, onChange }: TimelineToolbarProps) {
  const toggleLane = (id: LaneId) => {
    const lanes = new Set(filters.lanes);
    if (lanes.has(id)) lanes.delete(id);
    else lanes.add(id);
    onChange({ ...filters, lanes });
  };
  const hidden = ALL_LANES.length - filters.lanes.size;

  return (
    <div className={styles.toolbar}>
      <CheckboxMenu<LaneId>
        label={hidden === 0 ? 'Todos los canales' : `Canales (${filters.lanes.size} de ${ALL_LANES.length})`}
        options={model.lanes.map((lane) => ({
          value: lane.id,
          label: lane.label.charAt(0) + lane.label.slice(1).toLowerCase(),
          checked: filters.lanes.has(lane.id),
          color: lane.color,
          count: lane.items.length,
        }))}
        onToggle={toggleLane}
        onSelectAll={() => onChange({ ...filters, lanes: new Set(ALL_LANES) })}
      />
      <div className={styles.severity}>
        <SegmentedControl<SeverityFilter>
          ariaLabel="Mostrar"
          options={[
            { value: 'all', label: 'Todo' },
            { value: 'errors', label: `Errores (${errorCount})`, disabled: errorCount === 0 },
            { value: 'warnings', label: `Avisos (${warningCount})`, disabled: warningCount === 0 },
          ]}
          value={filters.severity}
          onChange={(severity) => onChange({ ...filters, severity })}
        />
      </div>
      {!isDefaultFilters(filters) && (
        <button type="button" className={styles.clear} onClick={() => onChange(DEFAULT_FILTERS)}>
          Limpiar filtros
        </button>
      )}
    </div>
  );
}

/** Buscador que vive en el título del panel "Línea de tiempo". */
export function TimelineSearch({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <label className={styles.search}>
      <IconSearch width={15} height={15} />
      <span className={styles.srOnly}>Buscar en la línea de tiempo</span>
      <input
        type="search"
        value={value}
        placeholder="Buscar: /api/login, 500, TypeError…"
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}
