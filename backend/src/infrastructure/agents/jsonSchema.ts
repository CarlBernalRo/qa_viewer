import { z, type ZodType } from 'zod';

/** El esquema de zod como JSON Schema para pedir la respuesta estructurada (sin `$schema`, que las APIs no usan). */
export function jsonSchemaOf(schema: ZodType): Record<string, unknown> {
  const json = { ...z.toJSONSchema(schema) } as Record<string, unknown>;
  delete json['$schema'];
  return json;
}

/** Algunos modelos envuelven el JSON en un bloque ```json aunque se pida JSON puro. */
export function stripCodeFence(text: string): string {
  return text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
}
