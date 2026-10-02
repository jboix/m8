/**
 * The usage report as the settings show it: local days, totals, rows and the
 * numbers as text. Every moment is built from local dates, so the tests pass
 * in any time zone.
 */
import { describe, expect, test } from 'bun:test';
import { NO_TOKENS, type UsageBucket, type UsageReport } from '@m8/shared';
import {
  axisTicks,
  costByDay,
  formatAxisMoney,
  formatLiveTime,
  formatMoney,
  formatTokens,
  labelEvery,
  rangeStart,
  totalUsage,
  usageRows,
} from './days.ts';

/**
 * A local moment.
 *
 * @param day - The day of March 2026.
 * @param hour - The hour.
 * @param minute - The minute.
 * @returns Ms since the epoch.
 */
function at(day: number, hour = 0, minute = 0): number {
  return new Date(2026, 2, day, hour, minute).getTime();
}

/**
 * A bucket with nothing in it but what the test gives.
 *
 * @param change - What the bucket holds.
 * @returns The bucket.
 */
function bucket(change: Partial<UsageBucket>): UsageBucket {
  return {
    ...NO_TOKENS,
    hour: at(10, 12),
    purpose: 'conversation',
    model: 'live',
    calls: 0,
    turns: 0,
    liveMs: 0,
    costMicros: 0,
    savedMicros: 0,
    unpriced: 0,
    ...change,
  };
}

/**
 * A report over some buckets.
 *
 * @param from - The start.
 * @param to - The end.
 * @param buckets - The buckets.
 * @returns The report.
 */
function report(from: number, to: number, buckets: UsageBucket[]): UsageReport {
  return { from, to, buckets, pricesCheckedOn: '2026-03-01' };
}

describe('the start of a range', () => {
  test('is local midnight today, six days ago or twenty-nine days ago', () => {
    const now = at(30, 15, 20);

    expect(rangeStart('today', now)).toBe(at(30));
    expect(rangeStart('week', now)).toBe(at(24));
    expect(rangeStart('month', now)).toBe(at(1));
  });

  test('crosses a month boundary on the calendar', () => {
    expect(rangeStart('week', at(3, 9))).toBe(new Date(2026, 1, 25).getTime());
  });
});

describe('the cost by local day', () => {
  test('fills the days with nothing spent, oldest first', () => {
    const days = costByDay(report(at(24), at(30, 15), []));

    expect(days.map((day) => day.start)).toEqual(
      [24, 25, 26, 27, 28, 29, 30].map((day) => at(day)),
    );
    expect(days.every((day) => day.conversation === 0 && day.memory === 0)).toBe(true);
  });

  test('puts the conversation in one series and every other purpose in the other', () => {
    const days = costByDay(
      report(at(29), at(30, 15), [
        bucket({ hour: at(29, 23), purpose: 'conversation', costMicros: 500 }),
        bucket({ hour: at(30, 0), purpose: 'conversation', costMicros: 100 }),
        bucket({ hour: at(30, 0), purpose: 'summary', costMicros: 30 }),
        bucket({ hour: at(30, 14), purpose: 'self-model', costMicros: 20 }),
        bucket({ hour: at(30, 14), purpose: 'situation', costMicros: 4 }),
        bucket({ hour: at(30, 14), purpose: 'ping', costMicros: 1 }),
      ]),
    );

    expect(days).toEqual([
      { start: at(29), conversation: 500, memory: 0 },
      { start: at(30), conversation: 100, memory: 55 },
    ]);
  });

  test('has one day for today', () => {
    const now = at(30, 15);

    expect(costByDay(report(rangeStart('today', now), now, []))).toHaveLength(1);
  });

  test('has thirty days for the month', () => {
    const now = at(30, 15);

    expect(costByDay(report(rangeStart('month', now), now, []))).toHaveLength(30);
  });
});

describe('the totals', () => {
  test('sum tokens in, out and cached, and the share served from the cache', () => {
    const totals = totalUsage([
      bucket({ inputText: 100, inputAudio: 50, cachedText: 50, outputAudio: 40, thinking: 10 }),
      bucket({ purpose: 'summary', inputImage: 200, cachedImage: 200, outputText: 5 }),
    ]);

    expect(totals.tokensIn).toBe(600);
    expect(totals.tokensOut).toBe(55);
    expect(totals.cachedTokens).toBe(250);
    expect(totals.cachedShare).toBeCloseTo(250 / 600);
  });

  test('count sessions as the calls of the conversation only', () => {
    const totals = totalUsage([
      bucket({ calls: 2, liveMs: 60_000, costMicros: 10, savedMicros: 3, unpriced: 1 }),
      bucket({ purpose: 'summary', calls: 3, costMicros: 5, savedMicros: 1 }),
    ]);

    expect(totals).toMatchObject({
      calls: 5,
      sessions: 2,
      liveMs: 60_000,
      costMicros: 15,
      savedMicros: 4,
      unpriced: 1,
    });
  });

  test('give a share of 0 when nothing came in', () => {
    expect(totalUsage([]).cachedShare).toBe(0);
  });
});

describe('the rows by model and purpose', () => {
  test('merge the hours and sort by cost, most expensive first', () => {
    const rows = usageRows([
      bucket({ model: 'flash', purpose: 'summary', calls: 1, costMicros: 10, inputText: 7 }),
      bucket({ model: 'live', calls: 1, turns: 3, costMicros: 400, outputAudio: 9 }),
      bucket({ model: 'flash', purpose: 'summary', calls: 2, costMicros: 15, thinking: 2 }),
      bucket({ model: 'flash', purpose: 'self-model', calls: 1, costMicros: 20 }),
    ]);

    expect(rows).toEqual([
      {
        model: 'live',
        purpose: 'conversation',
        calls: 1,
        turns: 3,
        tokensIn: 0,
        tokensOut: 9,
        costMicros: 400,
      },
      {
        model: 'flash',
        purpose: 'summary',
        calls: 3,
        turns: 0,
        tokensIn: 7,
        tokensOut: 2,
        costMicros: 25,
      },
      {
        model: 'flash',
        purpose: 'self-model',
        calls: 1,
        turns: 0,
        tokensIn: 0,
        tokensOut: 0,
        costMicros: 20,
      },
    ]);
  });
});

describe('the numbers as text', () => {
  test('write money with two decimals from a dollar, four below, and zero as $0.00', () => {
    expect(formatMoney(1_240_000)).toBe('$1.24');
    expect(formatMoney(12_345_678_900)).toBe('$12,345.68');
    expect(formatMoney(3_800)).toBe('$0.0038');
    expect(formatMoney(0)).toBe('$0.00');
    expect(formatMoney(27)).toBe('<$0.0001');
    expect(formatMoney(50)).toBe('$0.0001');
  });

  test('write axis amounts without trailing zeros past the cents', () => {
    expect(formatAxisMoney(10_000)).toBe('$0.01');
    expect(formatAxisMoney(2_500)).toBe('$0.0025');
    expect(formatAxisMoney(1_500_000)).toBe('$1.50');
  });

  test('write tokens with separators, and compact from a hundred thousand', () => {
    expect(formatTokens(12_345)).toBe('12,345');
    expect(formatTokens(250_000)).toBe('250K');
    expect(formatTokens(1_234_567)).toBe('1.2M');
  });

  test('write live time in minutes, and hours from an hour', () => {
    expect(formatLiveTime(12 * 60_000)).toBe('12 min');
    expect(formatLiveTime(65 * 60_000)).toBe('1 h 05 min');
    expect(formatLiveTime(0)).toBe('0 min');
  });
});

describe('the chart axis', () => {
  test('starts at 0 and reaches the highest day in two or three round steps', () => {
    expect(axisTicks(1_010_000)).toEqual([0, 500_000, 1_000_000, 1_500_000]);
    expect(axisTicks(38_000)).toEqual([0, 20_000, 40_000]);
    expect(axisTicks(0)).toEqual([0, 100]);
  });

  test('always draws two to four gridlines', () => {
    for (const highest of [1, 99, 101, 250, 777, 12_345, 99_999, 4_200_000]) {
      const ticks = axisTicks(highest);
      expect(ticks.length).toBeGreaterThanOrEqual(2);
      expect(ticks.length).toBeLessThanOrEqual(4);
      expect(ticks.at(-1)).toBeGreaterThanOrEqual(highest);
    }
  });

  test('labels every day of a week and every fifth day of a month', () => {
    expect(labelEvery(1)).toBe(1);
    expect(labelEvery(7)).toBe(1);
    expect(labelEvery(30)).toBe(5);
  });
});
