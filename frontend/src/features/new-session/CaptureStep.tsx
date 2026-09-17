import {
  AGENT_CATALOG,
  AGENT_ORDER,
  ALL_CAPTURE_CHANNELS,
  ALL_REDACTION_PRESETS,
  SPECIALIST_AGENTS,
  type AnalysisMode,
  type Environment,
  type SpecialistId,
} from '@rastro/shared';
import { Link } from 'react-router';
import { CHANNEL_META, ENVIRONMENT_DESCRIPTIONS, ENVIRONMENTS, PRESET_META } from '../../shared/lib/labels';
import { Field, InfoTip, Panel, SegmentedControl, TagInput, TextInput, Toggle } from '../../shared/ui';
import { AgentAvatar } from '../session-detail/agents/AgentAvatar';
import { AgentTooltip } from '../session-detail/agents/AgentTooltip';
import { useAgentStatus } from '../sessions/api';
import { isValidRegex, type FieldErrors, type NewSessionForm } from './model';
import styles from './NewSession.module.css';

interface StepProps {
  form: NewSessionForm;
  errors: FieldErrors;
  update: <K extends keyof NewSessionForm>(key: K, value: NewSessionForm[K]) => void;
}

const ANALYSIS_OPTIONS = [
  { value: 'none', label: 'Sin agentes' },
  { value: 'suggested', label: 'Sugeridos' },
  { value: 'manual', label: 'Elegir yo' },
] as const;

const ANALYSIS_NOTES: Record<AnalysisMode, string> = {
  none: 'Se graba todo y se guardan los eventos para revisarlos en la línea de tiempo. Al terminar, puedes pedir el análisis de los agentes desde la sesión.',
  suggested:
    'Al terminar de grabar, el equipo completo de agentes (8 especialistas y el QA Lead) arranca solo, en segundo plano. Podés seguir revisando la línea de tiempo mientras trabajan.',
  manual:
    'Elegís qué especialistas corren; el QA Lead siempre se agrega para juntar lo que encuentren. Arrancan solos al terminar de grabar, igual que "Sugeridos".',
};

function toggleAgent(list: readonly SpecialistId[], value: SpecialistId, on: boolean): SpecialistId[] {
  return on ? [...new Set([...list, value])] : list.filter((item) => item !== value);
}

function toggleIn<T>(list: readonly T[], value: T, on: boolean): T[] {
  return on ? [...new Set([...list, value])] : list.filter((item) => item !== value);
}

export function CaptureStep({ form, errors, update }: StepProps) {
  const agentStatus = useAgentStatus();
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

        <Panel
          title={
            <span className={styles.panelTitle}>
              Análisis de la sesión
              <InfoTip label="Qué es el análisis de la sesión">
                Sin agentes: se graba todo y tú revisas la línea de tiempo, los errores y el video. Con "Sugeridos", el
                equipo completo (8 especialistas y el QA Lead) analiza la sesión según tu objetivo y sus criterios en
                cuanto termina de grabarse. También puedes lanzarlo a mano después, desde el panel Agentes.
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
            <p className={styles.analysisNote}>{ANALYSIS_NOTES[form.analysisMode]}</p>
            {form.analysisMode === 'suggested' && (
              <>
                <ul className={styles.teamPreview}>
                  {AGENT_ORDER.map((agentId) => (
                    <li key={agentId} className={styles.teamMember}>
                      <AgentTooltip agent={agentId}>
                        <AgentAvatar agent={agentId} size={26} />
                      </AgentTooltip>
                      <span>
                        <strong>{AGENT_CATALOG[agentId].name}</strong>
                        <span className={styles.teamReads}>{AGENT_CATALOG[agentId].reads}</span>
                      </span>
                    </li>
                  ))}
                </ul>
                {agentStatus.data && !agentStatus.data.available && (
                  <p className={styles.analysisWarning}>
                    Los agentes no están configurados todavía ({agentStatus.data.reason}). La sesión se graba igual; el
                    análisis automático no va a arrancar hasta que configures una clave.
                  </p>
                )}
                <Link to="/agentes" className={styles.teamLink}>
                  Ver el equipo completo de agentes →
                </Link>
              </>
            )}
            {form.analysisMode === 'manual' && (
              <>
                <div className={styles.teamPreview}>
                  {SPECIALIST_AGENTS.map((agentId) => (
                    <label key={agentId} className={styles.teamCheckbox}>
                      <input
                        type="checkbox"
                        checked={form.selectedAgents.includes(agentId)}
                        onChange={(event) => update('selectedAgents', toggleAgent(form.selectedAgents, agentId, event.target.checked))}
                      />
                      <AgentTooltip agent={agentId}>
                        <AgentAvatar agent={agentId} size={26} />
                      </AgentTooltip>
                      <span>
                        <strong>{AGENT_CATALOG[agentId].name}</strong>
                        <span className={styles.teamReads}>{AGENT_CATALOG[agentId].reads}</span>
                      </span>
                    </label>
                  ))}
                  <div className={styles.teamMember}>
                    <AgentTooltip agent="lead">
                      <AgentAvatar agent="lead" size={26} />
                    </AgentTooltip>
                    <span>
                      <strong>{AGENT_CATALOG.lead.name}</strong>
                      <span className={styles.teamReads}>Siempre incluido, junta lo que encuentren los demás</span>
                    </span>
                  </div>
                </div>
                {errors.selectedAgents && <p className={styles.analysisWarning}>{errors.selectedAgents}</p>}
                {agentStatus.data && !agentStatus.data.available && (
                  <p className={styles.analysisWarning}>
                    Los agentes no están configurados todavía ({agentStatus.data.reason}). La sesión se graba igual; el
                    análisis automático no va a arrancar hasta que configures una clave.
                  </p>
                )}
              </>
            )}
          </div>
        </Panel>
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
      </aside>
    </div>
  );
}
