/** The autonomous behaviour: it blinks, it never holds perfectly still, and it stops on command. */
import { describe, expect, test } from 'bun:test';
import { createBrainstem } from './brainstem.ts';
import { RIG_REST, type RigParams } from './rig.ts';

/** A pose looking straight ahead, which is what most of these tests need. */
const level: RigParams = { ...RIG_REST };

/**
 * Run a brainstem for a while at 60 Hz.
 *
 * @param seconds - How long to run.
 * @param idle - Whether anything is holding the character's attention.
 * @param reducedMotion - Whether to honour the reduced-motion tuning.
 * @returns Every frame's contribution.
 */
function run(seconds: number, idle: boolean, reducedMotion = false) {
  const brainstem = createBrainstem({ reducedMotion });
  const frames = [];
  for (let frame = 0; frame < seconds * 60; frame++) {
    frames.push(brainstem.step(1 / 60, level, idle));
  }
  return frames;
}

describe('the brainstem', () => {
  test('blinks within a few seconds and opens again', () => {
    const drives = run(12, true);
    const lids = drives.map((drive) => drive.upperLid);

    expect(Math.max(...lids)).toBeGreaterThan(0.4);
    expect(Math.min(...lids)).toBe(0);
  });

  test('closes the eye from both edges at once', () => {
    const shut = run(12, true).reduce((deepest, drive) =>
      drive.upperLid > deepest.upperLid ? drive : deepest,
    );

    expect(shut.lowerLid).toBeCloseTo(shut.upperLid, 10);
  });

  test('swells and settles at rest, too slowly to read as movement', () => {
    const breaths = run(12, true).map((drive) => drive.pupil);

    expect(Math.max(...breaths)).toBeGreaterThan(0);
    expect(Math.max(...breaths.map(Math.abs))).toBeLessThan(0.05);
  });

  test('never holds the gaze perfectly still', () => {
    const moved = run(6, true).some((drive) => drive.gazeX !== 0 || drive.gazeY !== 0);

    expect(moved).toBe(true);
  });

  test('twitches less while something has its attention', () => {
    const watching = Math.max(...run(20, false).map((drive) => Math.abs(drive.gazeX)));
    const alone = Math.max(...run(20, true).map((drive) => Math.abs(drive.gazeX)));

    expect(watching).toBeGreaterThan(0);
    expect(watching).toBeLessThan(alone);
  });

  test('wanders further when nothing has its attention', () => {
    const idleReach = Math.max(...run(20, true).map((drive) => Math.abs(drive.gazeX)));
    const heldReach = Math.max(...run(20, false).map((drive) => Math.abs(drive.gazeX)));

    expect(idleReach).toBeGreaterThan(heldReach);
  });

  test('lowers the upper lids as the gaze drops', () => {
    const brainstem = createBrainstem({ reducedMotion: false });
    brainstem.setFrozen(true);
    brainstem.setFrozen(false);
    const down = brainstem.step(1 / 60, { ...RIG_REST, gazeY: 1 }, false);
    const up = brainstem.step(1 / 60, { ...RIG_REST, gazeY: -1 }, false);

    expect(down.upperLid).toBeGreaterThan(up.upperLid);
  });

  test('holds still under reduced motion apart from blinking', () => {
    const drives = run(20, true, true);

    expect(drives.every((drive) => drive.gazeX === 0 && drive.gazeY === 0)).toBe(true);
    expect(drives.every((drive) => drive.pupil === 0)).toBe(true);
    expect(Math.max(...drives.map((drive) => drive.upperLid))).toBeGreaterThan(0.4);
  });

  test('contributes nothing while frozen', () => {
    const brainstem = createBrainstem({ reducedMotion: false });
    brainstem.setFrozen(true);

    expect(brainstem.isFrozen()).toBe(true);
    for (let frame = 0; frame < 600; frame++) {
      expect(brainstem.step(1 / 60, level, true)).toEqual({
        gazeX: 0,
        gazeY: 0,
        upperLid: 0,
        lowerLid: 0,
        pupil: 0,
      });
    }
  });
});
