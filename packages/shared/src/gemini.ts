/**
 * The Gemini account: the key, which model does which job, and the daily
 * limit. The server keeps all of it, and the browser sees the key masked.
 */
import { z } from 'zod';

/** A Gemini model id, as the models endpoint names it without its `models/` prefix. */
export const ModelId = z
  .string()
  .trim()
  .regex(/^[a-z0-9][a-z0-9.-]{0,99}$/);

/** The jobs a model does. `live` is the conversation, `memory` the summaries and notes. */
export const ModelJob = z.enum(['live', 'memory']);

/** The jobs a model does. */
export type ModelJob = z.infer<typeof ModelJob>;

/** One model the key can use. */
export const GeminiModel = z.object({
  /** What the API calls it. */
  id: ModelId,
  /** What a person calls it. */
  name: z.string(),
});

/** One model the key can use. */
export type GeminiModel = z.infer<typeof GeminiModel>;

/** The models the key can use, by the kind of job they can do, newest first. */
export const GeminiModels = z.object({
  /** Models that hold a live session. */
  live: z.array(GeminiModel),
  /** Models that write text. */
  text: z.array(GeminiModel),
});

/** The models the key can use, newest first. */
export type GeminiModels = z.infer<typeof GeminiModels>;

/**
 * How much of the conversation every live turn re-reads. Gemini charges each
 * turn for its whole context, so a longer one remembers more of what was just
 * said and costs more per turn. The `[so far]` notes carry what slides out.
 */
export const ContextSize = z.enum(['short', 'medium', 'long']);

/** How much of the conversation every live turn re-reads. */
export type ContextSize = z.infer<typeof ContextSize>;

/**
 * The context, in tokens, at which each size slides, and what it slides down
 * to. The persona, the memory and the tools are about 3,500 of them, and are
 * never slid out.
 */
export const CONTEXT_TOKENS: Record<ContextSize, { trigger: number; target: number }> = {
  short: { trigger: 10_000, target: 6_000 },
  medium: { trigger: 20_000, target: 12_000 },
  long: { trigger: 40_000, target: 24_000 },
};

/** The most calls a day the limit can be set to. */
const MAX_CALLS_PER_DAY = 1_000_000;

/** Which model does which job, and how many calls a day he may make. */
export const GeminiChoice = z.object({
  /** The model that holds the conversation, or null before there is a key. */
  live: ModelId.nullable(),
  /** The model that writes his memory, or null before there is a key. */
  memory: ModelId.nullable(),
  /**
   * The most calls to Gemini in any 24 hours: each text request and each live
   * session opened counts as one. 0 means no limit.
   */
  callsPerDay: z.number().int().min(0).max(MAX_CALLS_PER_DAY),
  /** How much of the conversation every live turn re-reads. Defaulted, so a stored choice from before it keeps the rest. */
  context: ContextSize.default('medium'),
});

/** Which model does which job, and the daily limit. */
export type GeminiChoice = z.infer<typeof GeminiChoice>;

/** The choice before anybody has made one. */
export const DEFAULT_GEMINI_CHOICE: GeminiChoice = {
  live: null,
  memory: null,
  callsPerDay: 0,
  context: 'medium',
};

/** What the browser sees of the account. */
export const GeminiAccount = GeminiChoice.extend({
  /** The key, masked to its last four characters, or null when there is none. */
  key: z.string().nullable(),
});

/** What the browser sees of the account. */
export type GeminiAccount = z.infer<typeof GeminiAccount>;

/** A new key, as somebody pasted it. */
export const GeminiKeyChange = z.object({ key: z.string().trim().min(10).max(200) });

/** A change to the choice. What is left out stays as it is. */
export const GeminiChoiceChange = z.object({
  /** The model that holds the conversation. */
  live: ModelId.optional(),
  /** The model that writes his memory. */
  memory: ModelId.optional(),
  /** The daily limit. 0 means no limit. */
  callsPerDay: z.number().int().min(0).max(MAX_CALLS_PER_DAY).optional(),
  /** How much of the conversation every live turn re-reads. */
  context: ContextSize.optional(),
});

/** A change to the choice. */
export type GeminiChoiceChange = z.infer<typeof GeminiChoiceChange>;

/** What an account route answers a failure with: a message the person can act on. */
export const GeminiFailure = z.object({ error: z.string() });
