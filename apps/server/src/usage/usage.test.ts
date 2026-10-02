/** The usage ledger, and Gemini's usage reports read into it, with numbers from real sessions. */
import { describe, expect, test } from 'bun:test';
import { NO_TOKENS } from '@m8/shared';
import { countsFrom } from '../gemini/usage-metadata.ts';
import { openDatabase } from '../memory/db.ts';
import { callsSince, closeOpenCalls, endCall, openCall, recordTurn, settleCall } from './ledger.ts';
import { usageReport } from './report.ts';

/** An hour, in milliseconds. */
const HOUR = 3_600_000;

/** A live turn as `gemini-3.8-live` reported it, with a camera frame in the context. */
const LIVE_TURN = {
  promptTokenCount: 2166,
  responseTokenCount: 93,
  totalTokenCount: 2259,
  promptTokensDetails: [
    { modality: 'TEXT', tokenCount: 1578 },
    { modality: 'AUDIO', tokenCount: 270 },
    { modality: 'IMAGE', tokenCount: 256 },
  ],
  responseTokensDetails: [{ modality: 'AUDIO', tokenCount: 93 }],
  thoughtsTokenCount: 87,
};

/** A text reply as `gemini-3.8-flash` reported it. */
const TEXT_REPLY = {
  promptTokenCount: 19,
  candidatesTokenCount: 5,
  totalTokenCount: 115,
  promptTokensDetails: [{ modality: 'TEXT', tokenCount: 19 }],
  thoughtsTokenCount: 91,
};

describe('countsFrom', () => {
  test('reads a live turn, and gives the tokens the details leave out to text', () => {
    expect(countsFrom(LIVE_TURN)).toEqual({
      ...NO_TOKENS,
      // 2166 in all: 270 audio and 256 image, so 1640 text, not the 1578 listed.
      inputText: 1640,
      inputAudio: 270,
      inputImage: 256,
      outputAudio: 93,
      thinking: 87,
    });
  });

  test('reads a text reply, whose output has no details', () => {
    expect(countsFrom(TEXT_REPLY)).toEqual({
      ...NO_TOKENS,
      inputText: 19,
      outputText: 5,
      thinking: 91,
    });
  });

  test('takes cached tokens out of the fresh ones', () => {
    const counts = countsFrom({
      promptTokenCount: 5000,
      cachedContentTokenCount: 4000,
      cacheTokensDetails: [{ modality: 'TEXT', tokenCount: 4000 }],
      candidatesTokenCount: 10,
    });

    expect(counts).toMatchObject({ inputText: 1000, cachedText: 4000, outputText: 10 });
  });

  test('reads nothing as nothing', () => {
    expect(countsFrom(undefined)).toEqual(NO_TOKENS);
    expect(countsFrom('not usage')).toEqual(NO_TOKENS);
  });
});

describe('the ledger', () => {
  test('prices a call when its tokens arrive, at the price of the day it was made', () => {
    const db = openDatabase(':memory:');
    const id = openCall(db, { at: 0, purpose: 'summary', model: 'gemini-3.8-flash' });

    settleCall(db, id, countsFrom(TEXT_REPLY));

    // 19 x 0.75 + (5 + 91) x 3.75 = 374.25 micro-dollars.
    expect(db.query('SELECT kind, cost_micros FROM usage').get()).toEqual({
      kind: 'call',
      cost_micros: 374,
    });
  });

  test('records a live turn against its session, and does not count it as a call', () => {
    const db = openDatabase(':memory:');
    openCall(db, { at: 10, purpose: 'conversation', model: 'gemini-3.8-live', sessionId: 7 });

    recordTurn(db, { at: 20, model: 'gemini-3.8-live', sessionId: 7 }, countsFrom(LIVE_TURN));

    expect(callsSince(db, 0)).toBe(1);
    expect(db.query("SELECT session_id, cost_micros FROM usage WHERE kind = 'turn'").get()).toEqual(
      // 1640 x 0.75 + 270 x 3 + 256 x 1 + 93 x 12 + 87 x 4.5 = 3803.5.
      { session_id: 7, cost_micros: 3804 },
    );
  });

  test('keeps a call to an unpriced model, with no cost', () => {
    const db = openDatabase(':memory:');
    const id = openCall(db, { at: 0, purpose: 'ping', model: 'gemini-99-unknown' });

    settleCall(db, id, countsFrom(TEXT_REPLY));

    expect(db.query('SELECT cost_micros FROM usage').get()).toEqual({ cost_micros: null });
  });

  test('counts only the calls inside the window', () => {
    const db = openDatabase(':memory:');
    openCall(db, { at: 100, purpose: 'summary', model: 'gemini-3.8-flash' });
    openCall(db, { at: 200, purpose: 'summary', model: 'gemini-3.8-flash' });

    expect(callsSince(db, 150)).toBe(1);
  });
});

describe('the report', () => {
  test('sums by hour, purpose and model, oldest first, and counts what has no price', () => {
    const db = openDatabase(':memory:');
    settleCall(
      db,
      openCall(db, { at: HOUR + 5, purpose: 'summary', model: 'gemini-3.8-flash' }),
      countsFrom(TEXT_REPLY),
    );
    settleCall(
      db,
      openCall(db, { at: HOUR + 9, purpose: 'summary', model: 'gemini-3.8-flash' }),
      countsFrom(TEXT_REPLY),
    );
    openCall(db, { at: 10, purpose: 'ping', model: 'gemini-99-unknown' });

    const report = usageReport(db, 0, 2 * HOUR);

    expect(report.buckets.map((bucket) => [bucket.hour, bucket.purpose, bucket.calls])).toEqual([
      [0, 'ping', 1],
      [HOUR, 'summary', 2],
    ]);
    expect(report.buckets[0]).toMatchObject({ costMicros: 0, unpriced: 1 });
    expect(report.buckets[1]).toMatchObject({ inputText: 38, thinking: 182, costMicros: 748 });
  });

  test('counts a live session from its start to its end, or to now while it is open', () => {
    const db = openDatabase(':memory:');
    const ended = openCall(db, { at: 1000, purpose: 'conversation', model: 'gemini-3.8-live' });
    openCall(db, { at: 5000, purpose: 'conversation', model: 'gemini-3.8-live' });
    endCall(db, ended, 4000);
    endCall(db, ended, 9000);

    const [bucket] = usageReport(db, 0, 8000).buckets;

    // 3000 for the ended one, which the second end does not move, and 3000 for the open one.
    expect(bucket).toMatchObject({ calls: 2, liveMs: 6000 });
  });

  test('leaves out what happened before the start', () => {
    const db = openDatabase(':memory:');
    openCall(db, { at: 10, purpose: 'ping', model: 'gemini-3.8-flash' });

    expect(usageReport(db, 11, 100).buckets).toEqual([]);
  });

  test('closes a session a crash left open at its last turn', () => {
    const db = openDatabase(':memory:');
    openCall(db, { at: 1000, purpose: 'conversation', model: 'gemini-3.8-live', sessionId: 3 });
    recordTurn(db, { at: 2500, model: 'gemini-3.8-live', sessionId: 3 }, NO_TOKENS);

    expect(closeOpenCalls(db)).toBe(1);
    expect(usageReport(db, 0, 99_000).buckets[0]?.liveMs).toBe(1500);
  });
});
