import {
  ALL_CAPTURE_CHANNELS,
  ALL_REDACTION_PRESETS,
  captureConfigSchema,
  objectiveSchema,
  type AnalysisMode,
  type CaptureChannel,
  type CreateSessionInput,
  type Environment,
  type RedactionPreset,
  type SpecialistId,
  type TestType,
} from '@rastro/shared';
import type { z } from 'zod';

/** Estado editable del asistente de nueva sesión (strings sueltos, todavía sin validar). */
export interface NewSessionForm {
  sessionName: string;
  statement: string;
  testType: TestType;
  criteria: string[];
  include: string[];
  exclude: string[];
  testData: string;
  linkedIssue: string;
  startUrl: string;
  environment: Environment;
  channels: CaptureChannel[];
  presets: RedactionPreset[];
  customPatterns: string[];
  analysisMode: AnalysisMode;
  /** Solo con analysisMode "manual" ("Elegir yo"). */
  selectedAgents: SpecialistId[];
}

export const INITIAL_FORM: NewSessionForm = {
  sessionName: '',
  statement: '',
  testType: 'funcional',
  criteria: [''],
  include: [],
  exclude: [],
  testData: '',
  linkedIssue: '',
  startUrl: 'https://',
  environment: 'QA',
  channels: [...ALL_CAPTURE_CHANNELS],
  presets: [...ALL_REDACTION_PRESETS],
  customPatterns: [],
  analysisMode: 'none',
  selectedAgents: [],
};

export type FieldErrors = Partial<Record<string, string>>;

function toObjective(form: NewSessionForm) {
  const testData = form.testData.trim();
  const linkedIssue = form.linkedIssue.trim();
  return {
    sessionName: form.sessionName,
    statement: form.statement,
    testType: form.testType,
    criteria: form.criteria
      .map((text) => text.trim())
      .filter(Boolean)
      .map((text, index) => ({ id: `CA${index + 1}`, text })),
    scope: { include: form.include, exclude: form.exclude },
    ...(testData ? { testData } : {}),
    ...(linkedIssue ? { linkedIssue } : {}),
  };
}

function toCapture(form: NewSessionForm) {
  return {
    startUrl: form.startUrl.trim(),
    environment: form.environment,
    channels: form.channels,
    redaction: { presets: form.presets, customPatterns: form.customPatterns },
    analysisMode: form.analysisMode,
    ...(form.analysisMode === 'manual' ? { selectedAgents: form.selectedAgents } : {}),
  };
}

/** Primer mensaje de error por campo de primer nivel (sessionName, criteria, startUrl…). */
function firstErrors(error: z.ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? 'form');
    out[key] ??= issue.message;
  }
  return out;
}

export function validateObjective(form: NewSessionForm): FieldErrors {
  const result = objectiveSchema.safeParse(toObjective(form));
  return result.success ? {} : firstErrors(result.error);
}

export function validateCapture(form: NewSessionForm): FieldErrors {
  const result = captureConfigSchema.safeParse(toCapture(form));
  const errors = result.success ? {} : firstErrors(result.error);
  if (form.analysisMode === 'manual' && form.selectedAgents.length === 0) {
    errors.selectedAgents = 'Elegí al menos un agente.';
  }
  return errors;
}

export function toCreateInput(form: NewSessionForm): CreateSessionInput {
  return {
    objective: objectiveSchema.parse(toObjective(form)),
    capture: captureConfigSchema.parse(toCapture(form)),
  };
}

export function isValidRegex(pattern: string): string | null {
  try {
    new RegExp(pattern);
    return null;
  } catch {
    return 'No es una expresión regular válida.';
  }
}
