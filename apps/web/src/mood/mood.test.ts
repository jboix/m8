/** The four numbers, and the one thing they are for: deciding how easily it reacts. */
import { describe, expect, test } from 'bun:test';
import { createMood } from './mood.ts';

/**
 * Let time pass.
 *
 * @param tracker - The mood.
 * @param seconds - How long.
 * @param engaged - Whether a conversation is going on.
 */
function run(tracker: ReturnType<typeof createMood>, seconds: number, engaged = false) {
  for (let step = 0; step < seconds * 10; step++) tracker.step(0.1, engaged);
}

describe('mood', () => {
  test('starts somewhere in the middle of everything', () => {
    const mood = createMood().mood();

    for (const value of Object.values(mood)) {
      expect(value).toBeGreaterThan(0);
      expect(value).toBeLessThan(1);
    }
  });

  test('gets bored when nothing is happening', () => {
    const tracker = createMood();
    const before = tracker.mood().boredom;
    run(tracker, 30);

    expect(tracker.mood().boredom).toBeGreaterThan(before + 0.3);
  });

  test('does not get bored during a conversation', () => {
    const tracker = createMood();
    run(tracker, 30, true);

    expect(tracker.mood().boredom).toBeLessThan(0.3);
  });

  test('settles back towards baseline after a jolt', () => {
    const tracker = createMood();
    tracker.nudge({ arousal: 0.7 });
    const jolted = tracker.mood().arousal;
    run(tracker, 60, true);

    expect(tracker.mood().arousal).toBeLessThan(jolted - 0.3);
  });

  test('keeps every value inside its range however hard it is pushed', () => {
    const tracker = createMood();
    tracker.nudge({ arousal: 9, valence: -9, curiosity: 9, boredom: -9 });
    const mood = tracker.mood();

    expect(mood.arousal).toBe(1);
    expect(mood.valence).toBe(0);
    expect(mood.curiosity).toBe(1);
    expect(mood.boredom).toBe(0);
  });
});

describe('the threshold mood sets', () => {
  test('drops as boredom rises, so a bored character reacts to more', () => {
    const tracker = createMood();
    const rested = tracker.threshold();
    run(tracker, 60);

    expect(tracker.threshold()).toBeLessThan(rested);
  });

  test('rises with arousal, so a door closing mid-conversation can wait', () => {
    const tracker = createMood();
    const calm = tracker.threshold();
    tracker.nudge({ arousal: 0.6 });

    expect(tracker.threshold()).toBeGreaterThan(calm);
  });

  test('never falls so far that everything fires', () => {
    const tracker = createMood();
    tracker.nudge({ boredom: 1, arousal: -1 });

    expect(tracker.threshold()).toBeGreaterThanOrEqual(0.25);
  });
});
