/**
 * The usage report turned into what the settings show: days in the browser's
 * time zone, totals, rows by model and purpose, and the numbers as text.
 */
import type { TokenCounts, UsageBucket, UsagePurpose, UsageReport } from '@m8/shared';

/** The ranges a person can pick. */
export type UsageRange = 'today' | 'week' | 'month';

/** How many days each range covers, today included. */
const RANGE_DAYS: Record<UsageRange, number> = { today: 1, week: 7, month: 30 };

/** What one local day cost, split into the two series of the chart. */
export interface UsageDay {
  /** Local midnight at the start of the day, in ms since the epoch. */
  start: number;
  /** What the conversation cost, in micro-dollars. */
  conversation: number;
  /** What everything else cost (summaries, the self-model, notes, pings), in micro-dollars. */
  memory: number;
}

/** The sums over the whole range. */
export interface UsageTotals {
  /** The priced cost, in micro-dollars. */
  costMicros: number;
  /** What the cache saved, in micro-dollars. */
  savedMicros: number;
  /** Input tokens, fresh and cached. */
  tokensIn: number;
  /** Output tokens, thinking included. */
  tokensOut: number;
  /** Input tokens served from the cache. */
  cachedTokens: number;
  /** The share of input served from the cache, 0 to 1. 0 when there was no input. */
  cachedShare: number;
  /** How long the live sessions were open, in ms. */
  liveMs: number;
  /** Every call: text requests and live sessions opened. */
  calls: number;
  /** Live sessions opened. */
  sessions: number;
  /** Rows whose model has no price. */
  unpriced: number;
}

/** What one model spent on one purpose over the range. */
export interface UsageRow {
  /** The model. */
  model: string;
  /** What the calls were for. */
  purpose: UsagePurpose;
  /** Calls made. */
  calls: number;
  /** Live turns. */
  turns: number;
  /** Input tokens, fresh and cached. */
  tokensIn: number;
  /** Output tokens, thinking included. */
  tokensOut: number;
  /** The priced cost, in micro-dollars. */
  costMicros: number;
}

/**
 * Local midnight at the start of the day a moment falls in.
 *
 * @param moment - Ms since the epoch.
 * @returns Local midnight, in ms since the epoch.
 */
function startOfDay(moment: number): number {
  const date = new Date(moment);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/**
 * Local midnight a number of days after the day a moment falls in. Days are
 * counted on the calendar, so a day with a clock change is still one day.
 *
 * @param moment - Ms since the epoch.
 * @param days - How many days later. Negative goes back.
 * @returns Local midnight, in ms since the epoch.
 */
function dayAfter(moment: number, days: number): number {
  const date = new Date(moment);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days).getTime();
}

/**
 * The start of a range: local midnight today, six days ago or twenty-nine days ago.
 *
 * @param range - The range picked.
 * @param now - The moment it is, in ms since the epoch.
 * @returns The `from` to ask the usage route for.
 */
export function rangeStart(range: UsageRange, now: number): number {
  return dayAfter(now, 1 - RANGE_DAYS[range]);
}

/**
 * The input tokens of a bucket, fresh and cached.
 *
 * @param counts - The bucket's tokens.
 * @returns The sum.
 */
function tokensIn(counts: TokenCounts): number {
  return (
    counts.inputText +
    counts.inputAudio +
    counts.inputImage +
    counts.cachedText +
    counts.cachedAudio +
    counts.cachedImage
  );
}

/**
 * The output tokens of a bucket, thinking included.
 *
 * @param counts - The bucket's tokens.
 * @returns The sum.
 */
function tokensOut(counts: TokenCounts): number {
  return counts.outputText + counts.outputAudio + counts.thinking;
}

/**
 * The cost of every local day of the report, empty days included, oldest first.
 *
 * @param report - The report.
 * @returns One entry per day from the day of `from` to the day of `to`.
 */
export function costByDay(report: UsageReport): UsageDay[] {
  const days: UsageDay[] = [];
  for (let start = startOfDay(report.from); start <= report.to; start = dayAfter(start, 1)) {
    days.push({ start, conversation: 0, memory: 0 });
  }
  const byStart = new Map(days.map((day) => [day.start, day]));
  for (const bucket of report.buckets) {
    const day = byStart.get(startOfDay(bucket.hour));
    if (!day) continue;
    if (bucket.purpose === 'conversation') day.conversation += bucket.costMicros;
    else day.memory += bucket.costMicros;
  }
  return days;
}

/**
 * The sums over every bucket of a report.
 *
 * @param buckets - The report's buckets.
 * @returns The totals. The cached share is 0 when there was no input.
 */
export function totalUsage(buckets: readonly UsageBucket[]): UsageTotals {
  const sum = (pick: (bucket: UsageBucket) => number) =>
    buckets.reduce((total, bucket) => total + pick(bucket), 0);
  const allIn = sum(tokensIn);
  const cachedTokens = sum((bucket) => bucket.cachedText + bucket.cachedAudio + bucket.cachedImage);
  return {
    costMicros: sum((bucket) => bucket.costMicros),
    savedMicros: sum((bucket) => bucket.savedMicros),
    tokensIn: allIn,
    tokensOut: sum(tokensOut),
    cachedTokens,
    cachedShare: allIn === 0 ? 0 : cachedTokens / allIn,
    liveMs: sum((bucket) => bucket.liveMs),
    calls: sum((bucket) => bucket.calls),
    sessions: sum((bucket) => (bucket.purpose === 'conversation' ? bucket.calls : 0)),
    unpriced: sum((bucket) => bucket.unpriced),
  };
}

/**
 * A row with nothing in it yet, for a bucket's model and purpose.
 *
 * @param bucket - The bucket that opens the row.
 * @returns The row, every count at 0.
 */
function emptyRow(bucket: UsageBucket): UsageRow {
  const { model, purpose } = bucket;
  return { model, purpose, calls: 0, turns: 0, tokensIn: 0, tokensOut: 0, costMicros: 0 };
}

/**
 * What each model spent on each purpose, most expensive first.
 *
 * @param buckets - The report's buckets.
 * @returns One row per model and purpose. Rows that cost the same keep the
 * order of more tokens first.
 */
export function usageRows(buckets: readonly UsageBucket[]): UsageRow[] {
  const rows = new Map<string, UsageRow>();
  for (const bucket of buckets) {
    const key = `${bucket.model}\u0000${bucket.purpose}`;
    const row = rows.get(key) ?? emptyRow(bucket);
    row.calls += bucket.calls;
    row.turns += bucket.turns;
    row.tokensIn += tokensIn(bucket);
    row.tokensOut += tokensOut(bucket);
    row.costMicros += bucket.costMicros;
    rows.set(key, row);
  }
  return [...rows.values()].sort(
    (a, b) => b.costMicros - a.costMicros || b.tokensIn + b.tokensOut - (a.tokensIn + a.tokensOut),
  );
}

/** Micro-dollars in a dollar. */
const MICROS = 1_000_000;

/** Dollars with two decimals. Numbers are written the same way in every language. */
const DOLLARS = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Dollars with four decimals, for amounts below a dollar. */
const CENTS = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 4,
  maximumFractionDigits: 4,
});

/** Dollars with as few decimals as the amount needs, two to four, for the chart's axis. */
const AXIS_DOLLARS = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});

/** The smallest amount four decimals can show, in micro-dollars: half of $0.0001. */
const SMALLEST_SHOWN = 50;

/**
 * An amount of money as text: `$1.24`, `$0.0038`, `$0.00`, `<$0.0001`.
 *
 * @param micros - The amount, in micro-dollars.
 * @returns Two decimals from a dollar up and for zero, four below a dollar.
 * An amount too small for four decimals says so, rather than look free.
 */
export function formatMoney(micros: number): string {
  const dollars = micros / MICROS;
  if (micros === 0 || dollars >= 1) return DOLLARS.format(dollars);
  if (micros < SMALLEST_SHOWN) return `<${CENTS.format((SMALLEST_SHOWN * 2) / MICROS)}`;
  return CENTS.format(dollars);
}

/**
 * An amount on the chart's axis: `$0.01`, `$0.0025`, `$1.50`.
 *
 * @param micros - The amount, in micro-dollars.
 * @returns The amount without trailing zeros past the cents.
 */
export function formatAxisMoney(micros: number): string {
  return AXIS_DOLLARS.format(micros / MICROS);
}

/** Token counts with thousands separators. */
const WHOLE = new Intl.NumberFormat('en-US');

/** Token counts in compact form, for large ones. */
const COMPACT = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 1,
});

/**
 * A count of tokens as text: `12,345` below a hundred thousand, `250K` or `1.2M` from there.
 *
 * @param count - The count.
 * @returns The count as text.
 */
export function formatTokens(count: number): string {
  return count < 100_000 ? WHOLE.format(count) : COMPACT.format(count);
}

/**
 * A length of live time as text: `12 min`, or `1 h 05 min` from an hour up.
 *
 * @param ms - The length, in ms.
 * @returns The length, rounded to the minute.
 */
export function formatLiveTime(ms: number): string {
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')} min`;
}

/**
 * The gridlines of the chart's axis, from 0 to the first round amount at or
 * above the highest day, in two or three equal steps.
 *
 * @param highest - The highest day's cost, in micro-dollars.
 * @returns The amounts of the gridlines, in micro-dollars, 0 first.
 */
export function axisTicks(highest: number): number[] {
  // The smallest step is a hundredth of a cent, the last digit the money shows.
  let magnitude = 100;
  for (;;) {
    for (const factor of [1, 2, 2.5, 5]) {
      const step = factor * magnitude;
      const count = Math.max(1, Math.ceil(highest / step));
      if (count <= 3) return Array.from({ length: count + 1 }, (_, index) => index * step);
    }
    magnitude *= 10;
  }
}

/**
 * Which days of the chart carry a label, so the labels never collide.
 *
 * @param dayCount - How many days the chart shows.
 * @returns Label every this many days, counted back from the last day.
 */
export function labelEvery(dayCount: number): number {
  return Math.max(1, Math.ceil(dayCount / 7));
}
