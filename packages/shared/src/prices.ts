/** What Gemini charges per model, and what one call cost. Prices are USD per million tokens. */
import type { TokenCounts } from './usage.ts';

/** The day the table below was last compared with {@link PRICES_SOURCE}. */
export const PRICES_CHECKED_ON = '2026-10-02';

/** The official page the prices come from: paid tier, standard. */
export const PRICES_SOURCE = 'https://ai.google.dev/gemini-api/docs/pricing';

/** A price per modality, in USD per million tokens. */
export interface ModalityRates {
  /** Text. */
  readonly text: number;
  /** Audio. */
  readonly audio: number;
  /** Image and video. */
  readonly image: number;
}

/** A model's prices with every rate filled in, in USD per million tokens. */
export interface Price {
  /** Fresh input. */
  readonly input: ModalityRates;
  /** Input served from the cache. Equal to `input` where the page lists no cache price. */
  readonly cached: ModalityRates;
  /** Output. Thinking is charged as text output. */
  readonly output: Pick<ModalityRates, 'text' | 'audio'>;
}

/** What one call cost, in millionths of a US dollar. */
export interface Cost {
  /** The whole cost of the call. */
  readonly costMicros: number;
  /** What the cache saved, against the same tokens as fresh input. */
  readonly savedMicros: number;
}

/** A model's prices as the page lists them. A missing rate falls back as each field says. */
interface ListedPrice {
  /** Fresh input. Audio and image fall back to text. */
  readonly input: { readonly text: number; readonly audio?: number; readonly image?: number };
  /** Cached input. A missing modality falls back to its fresh input price: no discount. */
  readonly cached?: Partial<ModalityRates>;
  /** Output. Audio falls back to text. */
  readonly output: { readonly text: number; readonly audio?: number };
}

/** The prices that apply from a day on. */
interface PricePeriod {
  /** The first day this period applies, `YYYY-MM-DD` in UTC. Absent means since always. */
  readonly from?: string;
  /** The prices in this period. */
  readonly price: ListedPrice;
}

/** The Gemini 3.6 to 3.8 Flash prices, which double on 2027-01-01. */
const FLASH_PERIODS: readonly PricePeriod[] = [
  {
    price: {
      input: { text: 0.75 },
      cached: { text: 0.075, audio: 0.075, image: 0.075 },
      output: { text: 3.75 },
    },
  },
  {
    from: '2027-01-01',
    price: {
      input: { text: 1.5 },
      cached: { text: 0.15, audio: 0.15, image: 0.15 },
      output: { text: 7.5 },
    },
  },
];

/** The Gemini 3.8 and 3.1 Live prices. The page lists no cache price for them. */
const LIVE_PERIODS: readonly PricePeriod[] = [
  { price: { input: { text: 0.75, audio: 3, image: 1 }, output: { text: 4.5, audio: 12 } } },
];

/**
 * Prices by model id. A key also covers every id that starts with the key and a `-`.
 * The pro models use the tier for prompts up to 200k tokens.
 */
const PRICE_TABLE: Readonly<Record<string, readonly PricePeriod[]>> = {
  'gemini-3.8-flash': FLASH_PERIODS,
  'gemini-3.7-flash': FLASH_PERIODS,
  'gemini-3.6-flash': FLASH_PERIODS,
  'gemini-3.5-flash': [
    {
      price: {
        input: { text: 1.5 },
        cached: { text: 0.15, audio: 0.15, image: 0.15 },
        output: { text: 9 },
      },
    },
  ],
  'gemini-3.5-flash-lite': [{ price: { input: { text: 0.3 }, output: { text: 2.5 } } }],
  'gemini-3.1-flash-lite': [
    {
      price: {
        input: { text: 0.25, audio: 0.5 },
        cached: { text: 0.025, audio: 0.05, image: 0.025 },
        output: { text: 1.5 },
      },
    },
  ],
  'gemini-3-flash-preview': [
    {
      price: {
        input: { text: 0.5, audio: 1 },
        cached: { text: 0.05, audio: 0.1, image: 0.05 },
        output: { text: 3 },
      },
    },
  ],
  'gemini-3.1-pro-preview': [
    {
      price: {
        input: { text: 2 },
        cached: { text: 0.2, audio: 0.2, image: 0.2 },
        output: { text: 12 },
      },
    },
  ],
  'gemini-2.5-pro': [
    {
      price: {
        input: { text: 1.25 },
        cached: { text: 0.125, audio: 0.125, image: 0.125 },
        output: { text: 10 },
      },
    },
  ],
  'gemini-2.5-flash': [
    {
      price: {
        input: { text: 0.3, audio: 1 },
        cached: { text: 0.03, audio: 0.1, image: 0.03 },
        output: { text: 2.5 },
      },
    },
  ],
  'gemini-2.5-flash-lite': [
    {
      price: {
        input: { text: 0.1, audio: 0.3 },
        cached: { text: 0.01, audio: 0.03, image: 0.01 },
        output: { text: 0.4 },
      },
    },
  ],
  'gemini-3.8-live': LIVE_PERIODS,
  'gemini-3.8-live-extended-thinking': LIVE_PERIODS,
  'gemini-3.1-flash-live-preview': LIVE_PERIODS,
  // Covers -latest, -preview-09-2025 and -preview-12-2025. The page lists the 12-2025 one.
  'gemini-2.5-flash-native-audio': [
    { price: { input: { text: 0.5, audio: 3, image: 3 }, output: { text: 2, audio: 12 } } },
  ],
};

/**
 * The table key for a model id: the key equal to it, or else the longest key
 * that is a prefix of it followed by `-`.
 * @param id - The model id without a `models/` prefix.
 * @returns The matching key, or `null` when no key matches.
 */
function tableKeyFor(id: string): string | null {
  if (id in PRICE_TABLE) return id;

  const prefixes = Object.keys(PRICE_TABLE).filter((key) => id.startsWith(`${key}-`));
  if (prefixes.length === 0) return null;

  return prefixes.reduce((longest, key) => (key.length > longest.length ? key : longest));
}

/**
 * The first moment a period applies.
 * @param period - The period.
 * @returns Milliseconds since the epoch, or minus infinity when it has no start.
 */
function startOf(period: PricePeriod): number {
  return period.from ? Date.parse(`${period.from}T00:00:00Z`) : Number.NEGATIVE_INFINITY;
}

/**
 * The period in force at a time: the latest one that started on or before it.
 * @param periods - A model's periods, in any order.
 * @param at - The time, in milliseconds since the epoch.
 * @returns The period, or `null` when none had started.
 */
function periodAt(periods: readonly PricePeriod[], at: number): PricePeriod | null {
  const started = periods.filter((period) => startOf(period) <= at);
  if (started.length === 0) return null;

  return started.reduce((latest, period) => (startOf(period) > startOf(latest) ? period : latest));
}

/**
 * Fill in every rate a listed price leaves out.
 * @param listed - The price as the page lists it.
 * @returns The price with every rate present.
 */
function resolvePrice(listed: ListedPrice): Price {
  const input: ModalityRates = {
    text: listed.input.text,
    audio: listed.input.audio ?? listed.input.text,
    image: listed.input.image ?? listed.input.text,
  };
  const cached: ModalityRates = { ...input, ...listed.cached };
  const output = { text: listed.output.text, audio: listed.output.audio ?? listed.output.text };
  return { input, cached, output };
}

/**
 * The price that applies to a model at a time.
 * @param model - The model id, with or without a leading `models/`.
 * @param at - The time of the call, in milliseconds since the epoch.
 * @returns The price, or `null` when the model is not in the table.
 */
export function priceOf(model: string, at: number): Price | null {
  const key = tableKeyFor(model.replace(/^models\//, ''));
  if (key === null) return null;

  const period = periodAt(PRICE_TABLE[key] ?? [], at);
  return period ? resolvePrice(period.price) : null;
}

/**
 * The cost of one call, and what its cached input saved.
 * @param model - The model id, with or without a leading `models/`.
 * @param counts - The tokens the call used.
 * @param at - The time of the call, in milliseconds since the epoch.
 * @returns Both amounts in whole millionths of a dollar, or `null` when the model has no price.
 */
export function costOf(model: string, counts: TokenCounts, at: number): Cost | null {
  const price = priceOf(model, at);
  if (!price) return null;

  // A price per million tokens times a token count is already in millionths of a dollar.
  const cost =
    counts.inputText * price.input.text +
    counts.inputAudio * price.input.audio +
    counts.inputImage * price.input.image +
    counts.cachedText * price.cached.text +
    counts.cachedAudio * price.cached.audio +
    counts.cachedImage * price.cached.image +
    (counts.outputText + counts.thinking) * price.output.text +
    counts.outputAudio * price.output.audio;
  return { costMicros: Math.round(cost), savedMicros: Math.round(cacheSaving(price, counts)) };
}

/**
 * What the cached input saved against paying the fresh input price for it.
 * @param price - The price that applied.
 * @param counts - The tokens the call used.
 * @returns The saving in millionths of a dollar, not rounded.
 */
function cacheSaving(price: Price, counts: TokenCounts): number {
  return (
    counts.cachedText * (price.input.text - price.cached.text) +
    counts.cachedAudio * (price.input.audio - price.cached.audio) +
    counts.cachedImage * (price.input.image - price.cached.image)
  );
}
