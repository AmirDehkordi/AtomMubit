import { z } from 'zod';

/**
 * JSON schema for OpenAI strict mode (tool parameters and response formats).
 * Drops the `$schema` key and rewrites what strict mode doesn't accept:
 * `oneOf` (from discriminated unions) becomes `anyOf`, and `const` becomes a
 * one-value `enum`. The schemas themselves use strictObject and nullable
 * fields so every property is required.
 */
export function strictJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const { $schema: _ignored, ...rest } = z.toJSONSchema(schema) as Record<string, unknown>;
  return rewrite(rest) as Record<string, unknown>;
}

function rewrite(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(rewrite);
  if (!node || typeof node !== 'object') return node;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node)) {
    if (key === 'oneOf') out.anyOf = rewrite(value);
    else if (key === 'const') out.enum = [value];
    else out[key] = rewrite(value);
  }
  return out;
}
