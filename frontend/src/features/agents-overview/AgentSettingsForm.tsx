import type { AgentAnimation, AgentEyeShape, AgentGesture, AgentId, AgentRosterMeta } from '@rastro/shared';
import { useState } from 'react';
import { Button, ErrorMessage, Field, Select, TagInput, TextArea } from '../../shared/ui';
import { RosterAvatar } from '../session-detail/agents/RosterAvatar';
import { useUpdateAgentSettings } from './api';
import styles from './AgentSettingsForm.module.css';

const EYE_SHAPES: readonly AgentEyeShape[] = ['round', 'visor', 'square'];
const EYE_SHAPE_LABELS: Record<AgentEyeShape, string> = { round: 'Redondos', visor: 'Visor', square: 'Cuadrados' };

const ANIMATIONS: readonly AgentAnimation[] = ['blink', 'blink-slow', 'pulse', 'scan'];
const ANIMATION_LABELS: Record<AgentAnimation, string> = {
  blink: 'Parpadeo',
  'blink-slow': 'Parpadeo lento',
  pulse: 'Pulso',
  scan: 'Barrido',
};

const GESTURES: readonly AgentGesture[] = ['tilt', 'nod', 'turn'];
const GESTURE_LABELS: Record<AgentGesture, string> = { tilt: 'Inclina la cabeza', nod: 'Asiente', turn: 'Gira la cabeza' };

interface AgentSettingsFormProps {
  agentId: AgentId;
  meta: AgentRosterMeta;
}

/** Avatar y prompt de un agente, editables y persistentes (afectan todas las corridas futuras, no una sesión puntual). */
export function AgentSettingsForm({ agentId, meta }: AgentSettingsFormProps) {
  const update = useUpdateAgentSettings();
  const [color, setColor] = useState(meta.color);
  const [eyeShape, setEyeShape] = useState<AgentEyeShape>(meta.eyeShape);
  const [animation, setAnimation] = useState<AgentAnimation>(meta.animation);
  const [gesture, setGesture] = useState<AgentGesture>(meta.gesture);
  const [mainObjective, setMainObjective] = useState(meta.role);
  const [secondaryObjectives, setSecondaryObjectives] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);

  const save = () => {
    setSaved(false);
    update.mutate(
      {
        id: agentId,
        color,
        eyeShape,
        animation,
        gesture,
        mainObjective: mainObjective.trim(),
        ...(secondaryObjectives.length > 0 ? { secondaryObjectives } : {}),
      },
      { onSuccess: () => setSaved(true) },
    );
  };

  return (
    <div className={styles.form}>
      <div className={styles.preview}>
        <RosterAvatar agent={agentId} color={color} name={meta.name} eyeShape={eyeShape} animation={animation} gesture={gesture} size={44} animate />
        <span className={styles.previewLabel}>Vista previa</span>
      </div>

      <div className={styles.row}>
        <Field label="Color">
          {(id) => (
            <input
              id={id}
              type="color"
              className={styles.colorInput}
              value={color}
              onChange={(event) => setColor(event.target.value)}
            />
          )}
        </Field>
        <Field label="Ojos">
          {(id) => (
            <Select id={id} value={eyeShape} onChange={(event) => setEyeShape(event.target.value as AgentEyeShape)}>
              {EYE_SHAPES.map((shape) => (
                <option key={shape} value={shape}>
                  {EYE_SHAPE_LABELS[shape]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Animación">
          {(id) => (
            <Select id={id} value={animation} onChange={(event) => setAnimation(event.target.value as AgentAnimation)}>
              {ANIMATIONS.map((item) => (
                <option key={item} value={item}>
                  {ANIMATION_LABELS[item]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Gesto">
          {(id) => (
            <Select id={id} value={gesture} onChange={(event) => setGesture(event.target.value as AgentGesture)}>
              {GESTURES.map((item) => (
                <option key={item} value={item}>
                  {GESTURE_LABELS[item]}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>

      <Field
        label="Objetivo principal"
        hint="Reemplaza el rol fijo del catálogo, tanto en esta pantalla como en el prompt real que recibe el modelo."
      >
        {(id) => (
          <TextArea id={id} value={mainObjective} onChange={(event) => setMainObjective(event.target.value)} rows={3} />
        )}
      </Field>

      <Field label="Objetivos secundarios" optional hint="Escribe y pulsa Enter para agregar cada uno.">
        {() => <TagInput values={secondaryObjectives} onChange={setSecondaryObjectives} placeholder="Agregar objetivo…" />}
      </Field>

      <div className={styles.actions}>
        <Button variant="primary" onClick={save} loading={update.isPending}>
          Guardar
        </Button>
        {saved && !update.isPending && <span className={styles.saved}>Guardado.</span>}
      </div>
      <ErrorMessage error={update.error} />
    </div>
  );
}
