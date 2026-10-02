import { describe, expect, test } from 'bun:test';
import { createFloor } from './floor.ts';

/**
 * A floor on a clock the test moves by hand.
 *
 * @returns The floor and a way to let time pass.
 */
function floorOnAClock() {
  let at = 0;
  const floor = createFloor(() => at);
  return {
    floor,
    pass(ms: number) {
      at += ms;
    },
  };
}

describe('the floor', () => {
  test('is free until somebody does something', () => {
    expect(floorOnAClock().floor.holder(false)).toBe('free');
  });

  test('is theirs while they talk, then his while the answer is made, then free', () => {
    const { floor, pass } = floorOnAClock();
    floor.heard();
    pass(500);
    expect(floor.holder(false)).toBe('theirs');
    pass(2000);
    expect(floor.holder(false)).toBe('thinking');
    floor.answered();
    expect(floor.holder(true)).toBe('speaking');
    expect(floor.holder(false)).toBe('free');
  });

  test('a line that asks for an answer takes the floor too', () => {
    const { floor } = floorOnAClock();
    floor.asked();
    expect(floor.holder(false)).toBe('thinking');
  });

  test('an answer that never comes does not hold the floor for good', () => {
    const { floor, pass } = floorOnAClock();
    floor.heard();
    pass(9000);
    expect(floor.holder(false)).toBe('free');
  });
});
