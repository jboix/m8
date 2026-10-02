import { describe, expect, test } from 'bun:test';
import { ALL_FLOURISHES, createFlourishes, FLOURISH_KINDS, MAX_BUBBLES } from './flourishes.ts';
import { createSeededRandom } from './random.ts';

/** One frame at sixty a second. */
const DT = 1 / 60;

/**
 * Run the flourishes for a while on one expression.
 *
 * @param flourishes - The flourishes.
 * @param emotion - The emotion held.
 * @param seconds - How long.
 * @param intensity - How strongly.
 * @returns The last state.
 */
function hold(
  flourishes: ReturnType<typeof createFlourishes>,
  emotion: Parameters<ReturnType<typeof createFlourishes>['step']>[1]['emotion'],
  seconds: number,
  intensity = 1,
) {
  let state = flourishes.step(DT, { emotion, intensity });
  for (let at = 0; at < seconds; at += DT) state = flourishes.step(DT, { emotion, intensity });
  return state;
}

/**
 * Flourishes on a fixed seed.
 *
 * @param reducedMotion - Whether motion is reduced.
 * @returns The flourishes.
 */
function seeded(reducedMotion = false) {
  return createFlourishes({ random: createSeededRandom(7), reducedMotion });
}

describe('the flourishes', () => {
  test('nothing shows on a neutral face, or on an emotion that has none', () => {
    for (const emotion of ['neutral', 'curious', 'focused'] as const) {
      const state = hold(seeded(), emotion, 1);
      expect(Object.values(state.level).every((level) => level === 0)).toBe(true);
    }
  });

  test('each one fades in on its own emotion and nothing else does', () => {
    for (const kind of FLOURISH_KINDS) {
      const state = hold(seeded(), kind, 2);
      expect(state.level[kind]).toBe(1);
      const others = FLOURISH_KINDS.filter((other) => other !== kind);
      expect(others.every((other) => state.level[other] === 0)).toBe(true);
    }
  });

  test('fades out again when the emotion passes', () => {
    const flourishes = seeded();
    hold(flourishes, 'shy', 2);
    expect(hold(flourishes, 'neutral', 2, 0).level.shy).toBe(0);
  });

  test('follows the intensity, and ignores a faint one', () => {
    expect(hold(seeded(), 'annoyed', 2, 0.6).level.annoyed).toBeCloseTo(0.6, 2);
    expect(hold(seeded(), 'annoyed', 2, 0.1).level.annoyed).toBe(0);
  });

  test('a switched off flourish never shows, and the rest still do', () => {
    const flourishes = seeded();
    flourishes.setSwitches({ ...ALL_FLOURISHES, shy: false });
    expect(hold(flourishes, 'shy', 2).level.shy).toBe(0);
    expect(hold(flourishes, 'sad', 2).level.sad).toBe(1);
  });

  test('a tear wells, falls, and comes back', () => {
    const flourishes = seeded();
    expect(hold(flourishes, 'sad', 1).tear).toBeLessThan(1);
    expect(hold(flourishes, 'sad', 1).tear).toBeGreaterThan(1);
    expect(hold(flourishes, 'sad', 2).tear).toBeLessThan(1);
  });

  test('a sweat drop wells, slides, and comes back', () => {
    const flourishes = seeded();
    expect(hold(flourishes, 'stressed', 0.5).sweat).toBeLessThan(1);
    expect(hold(flourishes, 'stressed', 1).sweat).toBeGreaterThan(1);
    expect(hold(flourishes, 'stressed', 1.6).sweat).toBeLessThan(1);
  });

  test('stressed trembles, and stops when it passes', () => {
    const flourishes = seeded();
    expect(hold(flourishes, 'stressed', 1).tremble).toBeGreaterThan(0);
    expect(hold(flourishes, 'neutral', 2, 0).tremble).toBe(0);
  });

  test('sleepy blows bubbles, never more than the writer can draw', () => {
    const flourishes = seeded();
    let most = 0;
    for (let at = 0; at < 20; at += DT) {
      most = Math.max(
        most,
        flourishes.step(DT, { emotion: 'sleepy', intensity: 1 }).bubbles.length,
      );
    }
    expect(most).toBeGreaterThan(1);
    expect(most).toBeLessThanOrEqual(MAX_BUBBLES);
  });

  test('the same seed blows the same bubbles', () => {
    const first = hold(seeded(), 'sleepy', 5).bubbles;
    const second = hold(seeded(), 'sleepy', 5).bubbles;
    expect(first).toEqual(second);
  });

  test('with reduced motion nothing drifts and nothing falls', () => {
    const state = hold(seeded(true), 'sad', 6);
    expect(state.tear).toBe(1);
    const stressed = hold(seeded(true), 'stressed', 6);
    expect(stressed.sweat).toBe(1);
    expect(stressed.tremble).toBe(0);
    const early = hold(seeded(true), 'sleepy', 2).bubbles;
    expect(early.length).toBe(2);
    expect(hold(seeded(true), 'sleepy', 6).bubbles).toEqual(early);
  });

  test('the thinking dots pop in one by one, hold, and start over', () => {
    const flourishes = seeded();
    expect(hold(flourishes, 'thinking', 0.5).dots).toBeLessThan(2);
    expect(hold(flourishes, 'thinking', 0.8).dots).toBeGreaterThan(3);
    expect(hold(flourishes, 'thinking', 0.8).dots).toBeLessThan(2);
    expect(hold(seeded(true), 'thinking', 1).dots).toBe(3);
  });
});
