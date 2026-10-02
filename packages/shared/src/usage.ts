/**
 * What a call to Gemini used: tokens by modality, and what the call was for.
 * The server records one row per text request and one per live turn.
 */
import { z } from 'zod';

/** What a call was made for. */
export const UsagePurpose = z.enum([
  /** A live session: the conversation itself. */
  'conversation',
  /** The episode and facts written after a session. */
  'summary',
  /** The self-model rewritten after an episode. */
  'self-model',
  /** The `[so far]` note during a long conversation. */
  'situation',
  /** The ping route in the rig. */
  'ping',
]);

/** What a call was made for. */
export type UsagePurpose = z.infer<typeof UsagePurpose>;

/** A count of tokens, never negative. */
const Tokens = z.number().int().min(0);

/**
 * The tokens one call used, split the way Gemini prices them.
 *
 * @remarks
 * The input counts are the fresh tokens: what the cache served is in the
 * `cached` counts, not in both. A live turn's input is the whole context the
 * turn read, because that is what Gemini counts and charges for each turn.
 * Video frames are counted as image.
 */
export const TokenCounts = z.object({
  /** Fresh text input. */
  inputText: Tokens,
  /** Fresh audio input. */
  inputAudio: Tokens,
  /** Fresh image and video input. */
  inputImage: Tokens,
  /** Text input served from the cache. */
  cachedText: Tokens,
  /** Audio input served from the cache. */
  cachedAudio: Tokens,
  /** Image and video input served from the cache. */
  cachedImage: Tokens,
  /** Text output. */
  outputText: Tokens,
  /** Audio output. */
  outputAudio: Tokens,
  /** Thinking. Gemini charges it as text output. */
  thinking: Tokens,
});

/** The tokens one call used. */
export type TokenCounts = z.infer<typeof TokenCounts>;

/** A call that used nothing yet: a live session as it opens, or a request that failed. */
export const NO_TOKENS: TokenCounts = {
  inputText: 0,
  inputAudio: 0,
  inputImage: 0,
  cachedText: 0,
  cachedAudio: 0,
  cachedImage: 0,
  outputText: 0,
  outputAudio: 0,
  thinking: 0,
};

/** The furthest back a usage report may reach, in days. */
export const MAX_USAGE_DAYS = 92;

/** What the usage route is asked: everything since a moment, in ms since the epoch. */
export const UsageQuery = z.object({ from: z.coerce.number().int().min(0) });

/**
 * What one model spent on one purpose in one hour. The browser groups hours
 * into days in its own time zone.
 */
export const UsageBucket = TokenCounts.extend({
  /** The start of the hour, in ms since the epoch. */
  hour: z.number().int(),
  /** What the calls were for. */
  purpose: UsagePurpose,
  /** The model. */
  model: z.string(),
  /** Calls made: text requests, and live sessions opened. */
  calls: Tokens,
  /** Live turns. */
  turns: Tokens,
  /** How long the live sessions opened in this hour were open, in ms. */
  liveMs: Tokens,
  /** The priced cost, in micro-dollars. Rows with no price add nothing. */
  costMicros: Tokens,
  /** What the cache saved, in micro-dollars. */
  savedMicros: Tokens,
  /** Rows whose model has no price, so the cost leaves them out. */
  unpriced: Tokens,
});

/** What one model spent on one purpose in one hour. */
export type UsageBucket = z.infer<typeof UsageBucket>;

/** Everything spent since a moment, by hour. */
export const UsageReport = z.object({
  /** The start of the report, in ms since the epoch. */
  from: z.number().int(),
  /** The end of the report: when it was made. */
  to: z.number().int(),
  /** Every hour, purpose and model that spent something, oldest first. */
  buckets: z.array(UsageBucket),
  /** The day the prices were last compared with Google's page, `YYYY-MM-DD`. */
  pricesCheckedOn: z.string(),
});

/** Everything spent since a moment, by hour. */
export type UsageReport = z.infer<typeof UsageReport>;
