/**
 * The gate that stops the character hearing itself. Cumulative speaker time,
 * and a hangover so a gap between chunks does not open it mid-sentence.
 */
import { describe, expect, test } from 'bun:test';
import { createSpeechClock } from './speech-clock.ts';

/** A clock and a scheduler a test drives by hand. */
function harness() {
  let at = 0;
  const pending: { run: () => void; at: number }[] = [];
  const clock = createSpeechClock(
    () => at,
    (run, delayMs) => {
      const entry = { run, at: at + delayMs };
      pending.push(entry);
      return () => {
        const index = pending.indexOf(entry);
        if (index >= 0) pending.splice(index, 1);
      };
    },
  );
  /** Move time forward, firing anything due. */
  const advance = (ms: number) => {
    at += ms;
    for (const entry of [...pending]) {
      if (entry.at > at) continue;
      pending.splice(pending.indexOf(entry), 1);
      entry.run();
    }
  };
  return { clock, advance };
}

describe('the speech clock', () => {
  test('starts silent and having said nothing', () => {
    const { clock } = harness();

    expect(clock.speaking()).toBe(false);
    expect(clock.spokenMs()).toBe(0);
  });

  test('counts a stretch of speech while it happens', () => {
    const { clock, advance } = harness();
    clock.started();
    advance(400);

    expect(clock.speaking()).toBe(true);
    expect(clock.spokenMs()).toBe(400);
  });

  test('keeps counting as speaking through a gap between chunks', () => {
    const { clock, advance } = harness();
    clock.started();
    advance(200);
    clock.drained();
    advance(100);

    expect(clock.speaking()).toBe(true);
  });

  test('stops once the gap outlasts the hangover', () => {
    const { clock, advance } = harness();
    clock.started();
    advance(200);
    clock.drained();
    advance(400);

    expect(clock.speaking()).toBe(false);
  });

  test('banks time across stretches rather than counting wall clock', () => {
    const { clock, advance } = harness();
    clock.started();
    advance(1000);
    clock.stopped();
    advance(30_000);
    clock.started();
    advance(500);

    expect(clock.spokenMs()).toBe(1500);
  });

  test('stops at once when playback is dropped, which is what barge-in does', () => {
    const { clock, advance } = harness();
    clock.started();
    advance(300);
    clock.stopped();

    expect(clock.speaking()).toBe(false);
    expect(clock.spokenMs()).toBe(300);
  });

  test('a chunk arriving during the hangover cancels it', () => {
    const { clock, advance } = harness();
    clock.started();
    clock.drained();
    advance(100);
    clock.started();
    advance(400);

    expect(clock.speaking()).toBe(true);
  });
});
