/**
 * What was spent since a moment, summed by hour, purpose and model. The
 * browser groups the hours into days in its own time zone.
 */
import type { Database } from 'bun:sqlite';
import { PRICES_CHECKED_ON, type UsageBucket, type UsageReport } from '@m8/shared';

/** An hour, in milliseconds. */
const HOUR_MS = 3_600_000;

/**
 * One row per hour, purpose and model. A live session's time is counted in
 * the hour it opened, up to now when it is still open. A row with no price
 * adds nothing to the cost and one to `unpriced`.
 */
const BUCKETS = `
  SELECT (at / ${HOUR_MS}) * ${HOUR_MS} AS hour, purpose, model,
    sum(kind = 'call') AS calls,
    sum(kind = 'turn') AS turns,
    sum(CASE WHEN kind = 'call' AND purpose = 'conversation'
      THEN max(0, coalesce(ended_at, $now) - at) ELSE 0 END) AS liveMs,
    sum(input_text) AS inputText, sum(input_audio) AS inputAudio,
    sum(input_image) AS inputImage, sum(cached_text) AS cachedText,
    sum(cached_audio) AS cachedAudio, sum(cached_image) AS cachedImage,
    sum(output_text) AS outputText, sum(output_audio) AS outputAudio,
    sum(thinking) AS thinking,
    coalesce(sum(cost_micros), 0) AS costMicros,
    sum(saved_micros) AS savedMicros,
    sum(cost_micros IS NULL) AS unpriced
  FROM usage
  WHERE at >= $from AND at <= $now
  GROUP BY hour, purpose, model
  ORDER BY hour, purpose, model`;

/**
 * Build the report.
 *
 * @param db - The database.
 * @param from - The start, in ms since the epoch.
 * @param now - The end, which is also what an open session is counted up to.
 * @returns Every hour, purpose and model that spent something, oldest first.
 */
export function usageReport(db: Database, from: number, now: number): UsageReport {
  const buckets = db.query<UsageBucket, { from: number; now: number }>(BUCKETS).all({ from, now });
  return { from, to: now, buckets, pricesCheckedOn: PRICES_CHECKED_ON };
}
