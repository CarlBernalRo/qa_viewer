import { useEffect, useState, type FormEvent } from 'react';
import {
  AGENT_PROVIDER_META,
  type AgentProviderId,
  type RealAgentProviderId,
  type UpdateAppSettingsInput,
} from '@rastro/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useAppSettings, useProviderModels, useUpdateAppSettings } from './api';
import { AppShell, Button, Field, hasProviderIcon, ProviderBrandIcon, Select, SkeletonGroup, TextInput } from '../../shared/ui';
import { cx } from '../../shared/lib/cx';
import styles from './SettingsPage.module.css';

/** "auto" primero (es el default), después los dos que ya funcionaban, después los nuevos, Ollama al final (local). */
const PROVIDER_ORDER: readonly AgentProviderId[] = [
  'auto',
  'openrouter',
  'gemini',
  'openai',
  'anthropic',
  'groq',
  'mistral',
  'deepseek',
  'ollama',
];

const EMPTY_FORM: UpdateAppSettingsInput = {
  agentProvider: 'auto',
  agentModel: '',
  geminiApiKey: '',
  openrouterApiKey: '',
  openaiApiKey: '',
  anthropicApiKey: '',
  groqApiKey: '',
  mistralApiKey: '',
  deepseekApiKey: '',
  ollamaApiKey: '',
};

type ApiKeyField = Exclude<keyof UpdateAppSettingsInput, 'agentProvider' | 'agentModel'>;

function keyField(provider: RealAgentProviderId): ApiKeyField {
  return `${provider}ApiKey` as ApiKeyField;
}

function isConfigured(id: AgentProviderId, form: UpdateAppSettingsInput): boolean {
  if (id === 'auto') return Boolean(form.openrouterApiKey || form.geminiApiKey);
  const meta = AGENT_PROVIDER_META[id];
  return meta.keyOptional ? true : Boolean(form[keyField(id)]);
}

function providerLabel(id: AgentProviderId): string {
  return id === 'auto' ? 'Automático' : AGENT_PROVIDER_META[id].label;
}

function providerColor(id: AgentProviderId): string {
  return id === 'auto' ? '#5f6863' : AGENT_PROVIDER_META[id].color;
}

function ProviderCard({
  id,
  index,
  active,
  selected,
  configured,
  onSelect,
}: {
  id: AgentProviderId;
  index: number;
  active: boolean;
  selected: boolean;
  configured: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className={cx(styles.card, selected && styles.cardSelected)}
      style={{ animationDelay: `${index * 40}ms` }}
      onClick={onSelect}
      aria-pressed={selected}
    >
      <span className={styles.cardBadge} style={{ background: providerColor(id) }}>
        {hasProviderIcon(id) ? <ProviderBrandIcon id={id} className={styles.cardIcon} /> : providerLabel(id).slice(0, 1)}
      </span>
      <span className={styles.cardName}>{providerLabel(id)}</span>
      {active ? (
        <span className={cx(styles.cardStatus, styles.cardStatusActive)}>Activo</span>
      ) : configured ? (
        <span className={styles.cardStatus}>Listo</span>
      ) : (
        <span className={cx(styles.cardStatus, styles.cardStatusOff)}>Sin configurar</span>
      )}
    </button>
  );
}

function ModelPicker({
  provider,
  value,
  onChange,
}: {
  provider: RealAgentProviderId;
  value: string;
  onChange: (value: string) => void;
}) {
  const models = useProviderModels(provider);
  return (
    <Field
      label="Modelo"
      optional
      hint={
        models.isError
          ? models.error instanceof Error
            ? models.error.message
            : 'No se pudo obtener la lista de modelos.'
          : `Dejar en blanco usa ${AGENT_PROVIDER_META[provider].defaultModel}.`
      }
    >
      {(id) => (
        <div className={styles.modelRow}>
          {models.data && models.data.length > 0 && (
            <Select
              aria-label={`Modelos disponibles de ${AGENT_PROVIDER_META[provider].label}`}
              value=""
              onChange={(event) => {
                if (event.target.value) onChange(event.target.value);
              }}
            >
              <option value="">{models.isFetching ? 'Actualizando…' : 'Elegir de la lista…'}</option>
              {models.data.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.label ?? model.id}
                </option>
              ))}
            </Select>
          )}
          <TextInput
            id={id}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder={AGENT_PROVIDER_META[provider].defaultModel}
          />
          <Button type="button" variant="ghost" onClick={() => void models.refetch()} disabled={models.isFetching}>
            {models.isFetching ? 'Buscando…' : 'Actualizar lista'}
          </Button>
        </div>
      )}
    </Field>
  );
}

function ProviderPanel({
  id,
  form,
  onChangeKey,
  onChangeModel,
  onSetProvider,
}: {
  id: AgentProviderId;
  form: UpdateAppSettingsInput;
  onChangeKey: (field: ApiKeyField, value: string) => void;
  onChangeModel: (value: string) => void;
  onSetProvider: () => void;
}) {
  const active = form.agentProvider === id;
  // Modelo en edición para ESTE proveedor: si no es el activo, no se toca el modelo real hasta
  // que se confirme "Usar {proveedor}" — así navegar por las tarjetas no arrastra el modelo de
  // otro proveedor al que se termine guardando.
  const [draftModel, setDraftModel] = useState(active ? (form.agentModel ?? '') : '');
  useEffect(() => {
    setDraftModel(active ? (form.agentModel ?? '') : '');
    // Solo al cambiar de tarjeta o de proveedor activo: no en cada tecla.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, active]);

  const changeModel = (value: string) => {
    setDraftModel(value);
    if (active) onChangeModel(value);
  };
  const activate = () => {
    onChangeModel(draftModel);
    onSetProvider();
  };

  if (id === 'auto') {
    return (
      <div className={styles.panel}>
        <p className={styles.panelText}>
          Automático usa OpenRouter si guardaste su clave; si no, usa Google Gemini directo. No tiene clave propia:
          configura la de OpenRouter o la de Gemini más abajo.
        </p>
        {!active && (
          <Button type="button" onClick={onSetProvider}>
            Usar Automático
          </Button>
        )}
      </div>
    );
  }

  const meta = AGENT_PROVIDER_META[id];
  return (
    <div className={styles.panel}>
      <Field label="Clave (API key)" optional={meta.keyOptional} hint={meta.keyOptional ? 'Solo hace falta para un servidor remoto.' : undefined}>
        {(fieldId) => (
          <TextInput
            id={fieldId}
            type="password"
            value={form[keyField(id)] ?? ''}
            onChange={(event) => onChangeKey(keyField(id), event.target.value)}
            placeholder={meta.keyPlaceholder}
          />
        )}
      </Field>
      <ModelPicker provider={id} value={draftModel} onChange={changeModel} />
      {!active && (
        <Button type="button" onClick={activate}>
          Usar {meta.label}
        </Button>
      )}
    </div>
  );
}

export function SettingsPage() {
  const { data: settings, isLoading } = useAppSettings();
  const updateSettings = useUpdateAppSettings();
  const queryClient = useQueryClient();

  const [form, setForm] = useState<UpdateAppSettingsInput>(EMPTY_FORM);
  const [selected, setSelected] = useState<AgentProviderId>('auto');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (settings) {
      setForm(settings);
      setSelected(settings.agentProvider);
    }
  }, [settings]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setSaved(false);
    updateSettings.mutate(form, {
      onSuccess: () => {
        setSaved(true);
        void queryClient.invalidateQueries({ queryKey: ['settings', 'models'] });
        setTimeout(() => setSaved(false), 3000);
      },
    });
  };

  return (
    <AppShell breadcrumb="Configuración">
      <div className={styles.container}>
        <div className={styles.header}>
          <h1>Ajustes globales</h1>
          <p className={styles.subtitle}>Elige y configura el proveedor de IA que usarán los agentes.</p>
        </div>

        {isLoading ? (
          <SkeletonGroup label="Cargando configuración…" className={styles.loading}>
            Cargando configuración…
          </SkeletonGroup>
        ) : (
          <form onSubmit={handleSubmit} className={styles.form}>
            <div className={styles.grid}>
              {PROVIDER_ORDER.map((id, index) => (
                <ProviderCard
                  key={id}
                  id={id}
                  index={index}
                  active={form.agentProvider === id}
                  selected={selected === id}
                  configured={isConfigured(id, form)}
                  onSelect={() => setSelected(id)}
                />
              ))}
            </div>

            <ProviderPanel
              id={selected}
              form={form}
              onChangeKey={(field, value) => setForm((prev) => ({ ...prev, [field]: value }))}
              onChangeModel={(value) => setForm((prev) => ({ ...prev, agentModel: value }))}
              onSetProvider={() => setForm((prev) => ({ ...prev, agentProvider: selected }))}
            />

            <div className={styles.actions}>
              <Button type="submit" disabled={updateSettings.isPending}>
                {updateSettings.isPending ? 'Guardando…' : 'Guardar cambios'}
              </Button>
              {saved && <span className={styles.success}>¡Guardado! Reinicia Rastro para que tome efecto.</span>}
            </div>
          </form>
        )}
      </div>
    </AppShell>
  );
}
