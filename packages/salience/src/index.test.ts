/**
 * The filter that decides whether something is worth reacting to. The
 * behaviours here are the whole point in miniature: one thing fires,
 * the same thing repeated stops firing, and it becomes interesting again once
 * it stops.
 */
import { describe, expect, test } from 'bun:test';
import { createSalience, DEFAULT_SALIENCE } from './index.ts';

/** A filter with the shipped tuning. */
const filter = () => createSalience();

/**
 * Let time pass in small steps, collecting anything that fired.
 *
 * @param salience - The filter.
 * @param seconds - How long.
 * @param threshold - What it takes to fire.
 * @returns Every fire in that span.
 */
function run(salience: ReturnType<typeof filter>, seconds: number, threshold = 1) {
  const fires = [];
  for (let step = 0; step < seconds * 20; step++) {
    const fire = salience.step(0.05, threshold);
    if (fire) fires.push(fire);
  }
  return fires;
}

describe('the salience filter', () => {
  test('holds no charge and fires at nothing', () => {
    const salience = filter();

    expect(salience.voltage()).toBe(0);
    expect(run(salience, 5)).toHaveLength(0);
  });

  test('fires when something big enough happens', () => {
    const salience = filter();
    salience.stimulate('vision.gesture:wave', 1.2);

    expect(run(salience, 2)).toHaveLength(1);
  });

  test('ignores something too small on its own', () => {
    const salience = filter();
    salience.stimulate('vision.motion', 0.3);

    expect(run(salience, 5)).toHaveLength(0);
  });

  test('adds several small things up into one reaction', () => {
    const salience = filter();
    salience.stimulate('vision.motion', 0.45);
    salience.stimulate('sound.loud', 0.45);
    salience.stimulate('vision.gesture:wave', 0.45);

    expect(run(salience, 2)).toHaveLength(1);
  });

  test('lets charge leak away rather than accumulating all day', () => {
    const salience = filter();
    for (let minute = 0; minute < 6; minute++) {
      salience.stimulate('vision.motion', 0.4);
      run(salience, 20);
    }

    expect(salience.voltage()).toBeLessThan(0.5);
  });

  test('says what caused it to fire, strongest first', () => {
    const salience = filter();
    salience.stimulate('sound.loud', 0.4);
    salience.stimulate('vision.gesture:wave', 1.1);
    const [fire] = run(salience, 2);

    expect(fire?.causes[0]).toBe('vision.gesture:wave');
    expect(fire?.causes).toContain('sound.loud');
  });

  test('will not fire twice in a row, however much happens', () => {
    const salience = filter();
    salience.stimulate('vision.gesture:wave', 4);
    const fires = run(salience, 0.5);
    salience.stimulate('sound.loud', 4);

    expect(fires).toHaveLength(1);
    expect(run(salience, 0.5)).toHaveLength(0);
  });
});

describe('habituation', () => {
  test('the fifth identical wave is ignored', () => {
    const salience = filter();
    const fires = [];
    for (let wave = 0; wave < 5; wave++) {
      salience.stimulate('vision.gesture:wave', 1.2);
      fires.push(run(salience, 3).length);
    }

    expect(fires[0]).toBe(1);
    expect(fires.at(-1)).toBe(0);
  });

  test('loses interest in what it keeps seeing', () => {
    const salience = filter();
    const interest = [salience.interest('vision.gesture:wave')];
    for (let wave = 0; wave < 5; wave++) {
      salience.stimulate('vision.gesture:wave', 1.2);
      run(salience, 2);
      interest.push(salience.interest('vision.gesture:wave'));
    }

    // Falling every time, rather than falling off a cliff at the second: the
    // fifth wave should be ignored, not the second.
    for (let step = 1; step < interest.length; step++) {
      expect(interest[step]).toBeLessThan(interest[step - 1] ?? 1);
    }
    expect(interest.at(-1)).toBeLessThan(0.5);
  });

  test('habituates each kind of thing separately', () => {
    const salience = filter();
    for (let wave = 0; wave < 4; wave++) {
      salience.stimulate('sound.class:dog', 1);
      run(salience, 2);
    }

    expect(salience.interest('sound.class:dog')).toBeLessThan(0.5);
    expect(salience.interest('sound.class:door')).toBe(1);
  });

  test('becomes interesting again once it stops', () => {
    const salience = filter();
    for (let wave = 0; wave < 4; wave++) {
      salience.stimulate('vision.gesture:wave', 1.2);
      run(salience, 2);
    }
    run(salience, 120);

    expect(salience.interest('vision.gesture:wave')).toBeGreaterThan(0.9);
  });

  test('a threshold raised by mood takes more to cross', () => {
    const calm = filter();
    calm.stimulate('vision.gesture:wave', 1.2);
    const bored = filter();
    bored.stimulate('vision.gesture:wave', 1.2);

    expect(run(calm, 2, 0.8)).toHaveLength(1);
    expect(run(bored, 2, 3)).toHaveLength(0);
  });

  test('the shipped tuning is the one these numbers describe', () => {
    expect(DEFAULT_SALIENCE.habituation).toBeLessThan(1);
    expect(DEFAULT_SALIENCE.recoverySeconds).toBeGreaterThan(DEFAULT_SALIENCE.leakSeconds);
  });
});
