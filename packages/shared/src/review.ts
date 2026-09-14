import { z } from 'zod';

/** Veredicto del QA sobre un criterio de aceptación. Sin veredicto, el criterio está pendiente. */
export const criterionVerdictSchema = z.enum(['pass', 'fail', 'blocked']);
export type CriterionVerdict = z.infer<typeof criterionVerdictSchema>;
export const CRITERION_VERDICTS = criterionVerdictSchema.options;

export const CRITERION_VERDICT_LABELS: Record<CriterionVerdict, string> = {
  pass: 'Cumple',
  fail: 'No cumple',
  blocked: 'Bloqueado',
};

const criterionIdSchema = z.string().regex(/^CA\d+$/);

/** Un momento que el QA marcó como evidencia, durante la grabación o al revisarla. */
export const markerSchema = z.object({
  id: z.string(),
  /** Milisegundos desde el inicio de la grabación: el mismo reloj que los eventos. */
  t: z.number().nonnegative(),
  criterionId: criterionIdSchema.nullable(),
  note: z.string().max(500),
  createdAt: z.iso.datetime(),
});
export type Marker = z.infer<typeof markerSchema>;

export const criterionReviewSchema = z.object({
  verdict: criterionVerdictSchema,
  note: z.string().max(1000).optional(),
  updatedAt: z.iso.datetime(),
});
export type CriterionReview = z.infer<typeof criterionReviewSchema>;

/** Lo que concluye el QA: veredicto por criterio y momentos marcados como evidencia. */
export const sessionReviewSchema = z.object({
  criteria: z.record(z.string(), criterionReviewSchema),
  markers: z.array(markerSchema),
});
export type SessionReview = z.infer<typeof sessionReviewSchema>;

export function emptyReview(): SessionReview {
  return { criteria: {}, markers: [] };
}

export const addMarkerInputSchema = z.object({
  /** Momento de la grabación. Si falta y la sesión está grabando, se usa "ahora". */
  t: z.number().nonnegative().optional(),
  criterionId: criterionIdSchema.nullable().default(null),
  note: z.string().trim().max(500).default(''),
});
export type AddMarkerInput = z.input<typeof addMarkerInputSchema>;

/** `verdict: null` vuelve el criterio a pendiente. */
export const setCriterionVerdictInputSchema = z.object({
  verdict: criterionVerdictSchema.nullable(),
  note: z.string().trim().max(1000).optional(),
});
export type SetCriterionVerdictInput = z.infer<typeof setCriterionVerdictInputSchema>;

export type CriteriaSummary = Record<CriterionVerdict | 'pending', number>;

/** Cuántos criterios cumplen, fallan, están bloqueados o siguen pendientes. */
export function summarizeCriteria(criterionIds: readonly string[], review: SessionReview): CriteriaSummary {
  const summary: CriteriaSummary = { pass: 0, fail: 0, blocked: 0, pending: 0 };
  for (const id of criterionIds) summary[review.criteria[id]?.verdict ?? 'pending'] += 1;
  return summary;
}
