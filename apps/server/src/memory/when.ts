/**
 * Says when something was, and what time it is, the way a person would. All of
 * it is in the server's timezone, which on localhost is the person's too.
 */

/** One minute. */
const MINUTE_MS = 60_000;

/** One hour. */
const HOUR_MS = 3_600_000;

/** One day. */
const DAY_MS = 86_400_000;

/**
 * Write a count with its unit.
 *
 * @param count - How many.
 * @param unit - The singular unit.
 * @returns For example `1 hour` or `3 hours`.
 */
function plural(count: number, unit: string): string {
  return `${count} ${unit}${count === 1 ? '' : 's'}`;
}

/**
 * The midnight a moment belongs to.
 *
 * @param moment - Any time.
 * @returns The start of that day.
 */
function startOfDay(moment: number): number {
  return new Date(moment).setHours(0, 0, 0, 0);
}

/**
 * Say how long ago something was.
 *
 * @param then - When it happened.
 * @param now - The present.
 * @returns `a moment ago`, minutes or hours within the same day, then
 * `yesterday` and a count of days, which go by calendar day and not by elapsed
 * hours: late last night is yesterday at breakfast.
 */
export function ago(then: number, now: number): string {
  const days = Math.round((startOfDay(now) - startOfDay(then)) / DAY_MS);
  if (days === 1) return 'yesterday';
  if (days > 1) return `${plural(days, 'day')} ago`;

  const elapsed = now - then;
  if (elapsed < 2 * MINUTE_MS) return 'a moment ago';
  if (elapsed < HOUR_MS) return `${plural(Math.round(elapsed / MINUTE_MS), 'minute')} ago`;
  return `${plural(Math.round(elapsed / HOUR_MS), 'hour')} ago`;
}

/**
 * Say how long something lasted.
 *
 * @param milliseconds - The length.
 * @returns `under a minute`, or a count of minutes or hours.
 */
export function lasting(milliseconds: number): string {
  if (milliseconds < MINUTE_MS) return 'under a minute';
  if (milliseconds < HOUR_MS) return plural(Math.round(milliseconds / MINUTE_MS), 'minute');
  return plural(Math.round(milliseconds / HOUR_MS), 'hour');
}

/**
 * The part of the day a moment falls in.
 *
 * @param moment - Any time.
 * @returns `night` before six, then `morning`, `afternoon` from noon, `evening` from six.
 */
function partOfDay(moment: number): string {
  const hour = new Date(moment).getHours();
  if (hour < 6) return 'night';
  if (hour < 12) return 'morning';
  return hour < 18 ? 'afternoon' : 'evening';
}

/**
 * Say what time it is.
 *
 * @param now - The present.
 * @returns For example `Monday, 21 September 2026 at 14:05, in the afternoon`.
 */
export function clock(now: number): string {
  const written = new Intl.DateTimeFormat('en-GB', { dateStyle: 'full', timeStyle: 'short' });
  const part = partOfDay(now);
  return `${written.format(now)}, ${part === 'night' ? 'at night' : `in the ${part}`}`;
}
