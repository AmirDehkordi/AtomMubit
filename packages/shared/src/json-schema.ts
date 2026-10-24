import { z } from 'zod';

/**
 * JSON schema for OpenAI strict mode (tool parameters and response formats).
 * Drops the `$schema` key; the schemas themselves use strictObject and
 * nullable fields so every property is required.
 */
export function strictJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const { $schema: _ignored, ...rest } = z.toJSONSchema(schema) as Record<string, unknown>;
  return rest;
}
