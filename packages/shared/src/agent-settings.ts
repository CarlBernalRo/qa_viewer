import { z } from 'zod';
import { agentAnimationSchema, agentEyeShapeSchema, agentGestureSchema } from './agents.js';

/**
 * Override editable por agente, persistente entre corridas: avatar y cómo se arma su prompt.
 * Todo opcional — sin override, se usa lo que ya trae `AGENT_CATALOG`/`AGENT_ROSTER`.
 */
export const agentSettingsSchema = z.object({
  color: z
    .string()
    .regex(/^#[0-9a-f]{6}$/i, 'Debe ser un color hexadecimal, p. ej. #2f7fbf')
    .optional(),
  eyeShape: agentEyeShapeSchema.optional(),
  animation: agentAnimationSchema.optional(),
  gesture: agentGestureSchema.optional(),
  /** Reemplaza el `role` del catálogo como frase de rol en el prompt y en la UI, si está definido. */
  mainObjective: z.string().trim().max(500).optional(),
  /** Puntos adicionales que se listan debajo del objetivo principal en el prompt. */
  secondaryObjectives: z.array(z.string().trim().min(1).max(300)).max(10).optional(),
});
export type AgentSettings = z.infer<typeof agentSettingsSchema>;

// Partial: no todos los agentes tienen override guardado.
export const agentSettingsMapSchema = z.object({
  api: agentSettingsSchema.optional(),
  frontend: agentSettingsSchema.optional(),
  sec: agentSettingsSchema.optional(),
  a11y: agentSettingsSchema.optional(),
  perf: agentSettingsSchema.optional(),
  rt: agentSettingsSchema.optional(),
  func: agentSettingsSchema.optional(),
  env: agentSettingsSchema.optional(),
  ux: agentSettingsSchema.optional(),
  reg: agentSettingsSchema.optional(),
  lead: agentSettingsSchema.optional(),
});
export type AgentSettingsMap = z.infer<typeof agentSettingsMapSchema>;
export const updateAgentSettingsInputSchema = agentSettingsSchema;
export type UpdateAgentSettingsInput = z.infer<typeof updateAgentSettingsInputSchema>;
