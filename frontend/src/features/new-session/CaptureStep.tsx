import { ALL_CAPTURE_CHANNELS, ALL_REDACTION_PRESETS, type AnalysisMode, type Environment } from '@rastro/shared';
import { CHANNEL_META, ENVIRONMENT_DESCRIPTIONS, ENVIRONMENTS, PRESET_META } from '../../shared/lib/labels';
import { Field, InfoTip, Panel, SegmentedControl, TagInput, TextInput, Toggle } from '../../shared/ui';
import { isValidRegex, type FieldErrors, type NewSessionForm } from './model';
import styles from './NewSession.module.css';

interface StepProps {
  form: NewSessionForm;
  errors: FieldErrors;
  update: <K extends keyof NewSessionForm>(key: K, value: NewSessionForm[K]) => void;
}

const ANALYSIS_OPTIONS = [
  { value: 'none', label: 'Sin agentes' },
  { value: 'suggested', label: 'Sugeridos', disabled: true, title: 'Llega en la etapa 2' },
  { value: 'manual', label: 'Elegir yo', disabled: true, title: 'Llega en la etapa 2' },
] as const;

function toggleIn<T>(list: readonly T[], value: T, on: boolean): T[] {
  return on ? [...new Set([...list, value])] : list.filter((item) => item !== value);
}

export function CaptureStep({ form, errors, update }: StepProps) {
  return (
    <div className={styles.columns}>
      <div className={styles.form}>
        <h1 className={styles.title}>Configurar la captura</h1>

        <Panel padded>
          <div className={styles.objectiveSummary}>
            <span className="cap">Objetivo</span>
            <strong>{form.statement}</strong>
          </div>
        </Panel>

        <div className={styles.rowUrl}>
          <Field
            label="URL inicial"
            error={errors.startUrl}
            info="La página donde se abre el navegador al empezar. Después puedes navegar a donde quieras: todo queda grabado."
          >
            {(id, describedBy) => (
              <TextInput
                id={id}
                className="mono"
                value={form.startUrl}
                onChange={(event) => update('startUrl', event.target.value)}
                invalid={Boolean(errors.startUrl)}
                aria-describedby={describedBy}
              />
            )}
          </Field>
          <Field
            label="Ambiente"
            hint={ENVIRONMENT_DESCRIPTIONS[form.environment]}
            info="En qué ambiente estás probando. Solo etiqueta la sesión para filtrarla y reportarla; a dónde entras lo decide la URL."
          >
            {() => (
              <SegmentedControl<Environment>
                ariaLabel="Ambiente"
                mono
                options={ENVIRONMENTS.map((env) => ({ value: env, label: env, title: ENVIRONMENT_DESCRIPTIONS[env] }))}
                value={form.environment}
                onChange={(environment) => update('environment', environment)}
              />
            )}
          </Field>
        </div>

        <Field
          label="Qué capturar"
          error={errors.channels}
          info="Cada canal es un tipo de información que se graba de la página. Si no sabes qué apagar, déjalos todos: no afectan a la página que pruebas."
        >
          {() => (
            <div className={styles.toggleList}>
              {ALL_CAPTURE_CHANNELS.map((channel) => (
                <Toggle
                  key={channel}
                  label={CHANNEL_META[channel].label}
                  description={CHANNEL_META[channel].description}
                  info={CHANNEL_META[channel].info}
                  swatch={CHANNEL_META[channel].color}
                  checked={form.channels.includes(channel)}
                  onChange={(on) => update('channels', toggleIn(form.channels, channel, on))}
                />
              ))}
            </div>
          )}
        </Field>
      </div>

      <aside className={styles.aside}>
        <Panel
          title={
            <span className={styles.panelTitle}>
              Ocultar datos sensibles
              <InfoTip label="Qué es ocultar datos sensibles">
                Estos datos se reemplazan por [oculto] antes de guardarse en disco. No cambia nada en la página que pruebas;
                solo protege lo que queda grabado.
              </InfoTip>
            </span>
          }
          padded={false}
        >
          <div className={styles.toggleListFlat}>
            {ALL_REDACTION_PRESETS.map((preset) => (
              <Toggle
                key={preset}
                label={PRESET_META[preset].label}
                description={PRESET_META[preset].description}
                checked={form.presets.includes(preset)}
                onChange={(on) => update('presets', toggleIn(form.presets, preset, on))}
              />
            ))}
          </div>
          <div className={styles.pad}>
            <Field
              label="Patrones propios"
              optional
              hint="Escribe y pulsa Enter para agregar."
              info="Para datos propios de tu sistema, con una expresión regular. ORD-\d+ oculta números de pedido como ORD-8821; \b\d{10}\b oculta cualquier número de 10 dígitos."
            >
              {(id, describedBy) => (
                <TagInput
                  id={id}
                  values={form.customPatterns}
                  onChange={(values) => update('customPatterns', values)}
                  validate={isValidRegex}
                  placeholder="ORD-\d+"
                  describedBy={describedBy}
                />
              )}
            </Field>
          </div>
        </Panel>

        <Panel
          title={
            <span className={styles.panelTitle}>
              Análisis de la sesión
              <InfoTip label="Qué es el análisis de la sesión">
                Sin agentes: se graba todo y tú revisas la línea de tiempo, los errores y el video. Con agentes (etapa 2), la
                IA revisará la sesión según tu objetivo y sus criterios.
              </InfoTip>
            </span>
          }
        >
          <div className={styles.analysis}>
            <SegmentedControl<AnalysisMode>
              ariaLabel="Modo de análisis"
              options={ANALYSIS_OPTIONS}
              value={form.analysisMode}
              onChange={(mode) => update('analysisMode', mode)}
            />
            <p className={styles.analysisNote}>
              <strong>Sin agentes:</strong> se graba todo y se guardan los eventos para revisarlos en la línea de tiempo.
              El análisis con agentes llega en la etapa 2.
            </p>
          </div>
        </Panel>
      </aside>
    </div>
  );
}
