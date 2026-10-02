/**
 * Turns a Zod schema into the shape Gemini accepts for a function declaration.
 *
 * Gemini takes a restricted subset of OpenAPI, not JSON Schema. Anything it does
 * not recognise, and `z.toJSONSchema` emits several such keys, makes it reject
 * the whole setup frame and close the socket without saying why.
 */
import { z } from 'zod';

/** The only keys Gemini reads. Everything else is dropped. */
const KEPT = [
  'type',
  'format',
  'description',
  'nullable',
  'enum',
  'properties',
  'required',
  'items',
];

/** A schema node, as `z.toJSONSchema` produces it. */
type SchemaNode = Record<string, unknown>;

/**
 * Strip a JSON Schema down to what Gemini reads, and uppercase its types.
 *
 * @param node - A JSON Schema node.
 * @returns The same shape, with unknown keys removed, recursively.
 */
export function toGeminiSchema(node: SchemaNode): SchemaNode {
  const out: SchemaNode = {};
  for (const [key, value] of Object.entries(node)) {
    if (KEPT.includes(key)) out[key] = convert(key, value);
  }
  return out;
}

/**
 * Convert one kept value, recursing where the schema nests.
 *
 * @param key - Which key it is under.
 * @param value - Its value.
 * @returns The converted value.
 */
function convert(key: string, value: unknown): unknown {
  if (key === 'type' && typeof value === 'string') return value.toUpperCase();
  if (!isNode(value)) return value;
  return key === 'properties' ? mapValues(value) : toGeminiSchema(value);
}

/**
 * Whether a value is a plain object worth recursing into.
 *
 * @param value - Anything.
 * @returns True for a non-null object that is not an array.
 */
function isNode(value: unknown): value is SchemaNode {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Convert every property of an object schema.
 *
 * @param properties - The `properties` map.
 * @returns The same map, each value converted.
 */
function mapValues(properties: SchemaNode): SchemaNode {
  const out: SchemaNode = {};
  for (const [name, value] of Object.entries(properties)) {
    out[name] = isNode(value) ? toGeminiSchema(value) : value;
  }
  return out;
}

/**
 * A function declaration's parameters, from the tool registry's Zod schema.
 *
 * @param input - The tool's input schema.
 * @returns Parameters Gemini will accept.
 */
export function toGeminiParameters(input: z.ZodType): SchemaNode {
  return toGeminiSchema(z.toJSONSchema(input, { io: 'input' }) as SchemaNode);
}
