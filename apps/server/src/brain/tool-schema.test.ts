/** Gemini takes a subset of OpenAPI, and rejects a whole setup over one stray key. */
import { describe, expect, test } from 'bun:test';
import { z } from 'zod';
import { toGeminiParameters, toGeminiSchema } from './tool-schema.ts';

describe('toGeminiSchema', () => {
  test('drops the keys Gemini does not read', () => {
    const schema = toGeminiSchema({
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      properties: { count: { type: 'integer', minimum: 1, maximum: 9, default: 4 } },
      required: ['count'],
      additionalProperties: false,
    });

    expect(schema).toEqual({
      type: 'OBJECT',
      properties: { count: { type: 'INTEGER' } },
      required: ['count'],
    });
  });

  test('uppercases types all the way down', () => {
    const schema = toGeminiSchema({
      type: 'object',
      properties: { tags: { type: 'array', items: { type: 'string' } } },
    });

    expect(schema).toEqual({
      type: 'OBJECT',
      properties: { tags: { type: 'ARRAY', items: { type: 'STRING' } } },
    });
  });

  test('keeps the things that carry meaning', () => {
    const schema = toGeminiSchema({
      type: 'string',
      enum: ['a', 'b'],
      description: 'which one',
      nullable: true,
    });

    expect(schema).toEqual({
      type: 'STRING',
      enum: ['a', 'b'],
      description: 'which one',
      nullable: true,
    });
  });
});

describe('toGeminiParameters', () => {
  test('converts a tool schema with defaults and bounds', () => {
    const parameters = toGeminiParameters(
      z.object({
        emotion: z.enum(['happy', 'sad']),
        intensity: z.number().min(0).max(1).default(0.6),
      }),
    );

    expect(parameters).toEqual({
      type: 'OBJECT',
      properties: {
        emotion: { type: 'STRING', enum: ['happy', 'sad'] },
        intensity: { type: 'NUMBER' },
      },
      required: ['emotion'],
    });
  });

  test('leaves no JSON Schema keyword behind anywhere', () => {
    const parameters = toGeminiParameters(
      z.object({ target: z.enum(['a']), hold_ms: z.number().int().min(200).default(2000) }),
    );
    const text = JSON.stringify(parameters);

    for (const banned of ['$schema', 'default', 'minimum', 'maximum', 'additionalProperties']) {
      expect(text).not.toContain(banned);
    }
  });
});
