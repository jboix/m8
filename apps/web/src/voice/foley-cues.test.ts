import { describe, expect, test } from 'bun:test';
import type { RigParams } from '../eyes/index.ts';
import { createFoleyCues, type FoleyFrame, maskCues } from './foley-cues.ts';

/** A pose at rest, close enough for these tests. */
const REST: RigParams = {
  gazeX: 0,
  gazeY: 0,
  leftUpperLid: 0.02,
  leftLowerLid: 0.015,
  leftPupil: 0.5,
  leftBrowTilt: 0,
  leftSquash: 0,
  leftSmile: 0,
  rightUpperLid: 0.02,
  rightLowerLid: 0.015,
  rightPupil: 0.5,
  rightBrowTilt: 0,
  rightSquash: 0,
  rightSmile: 0,
};

/**
 * A frame at rest with some things changed.
 *
 * @param pose - The parameters that differ from rest.
 * @param rest - The emotion and the gesture, when they matter.
 * @returns The frame.
 */
function frame(pose: Partial<RigParams> = {}, rest: Partial<FoleyFrame> = {}): FoleyFrame {
  return { pose: { ...REST, ...pose }, emotion: 'neutral', gesture: null, ...rest };
}

/** One frame at sixty a second. */
const DT = 1 / 60;

describe('the foley cues', () => {
  test('the first frame and a still rig are silent', () => {
    const cues = createFoleyCues();
    expect(cues.step(frame(), DT).servo).toBe(0);
    expect(cues.step(frame(), DT)).toEqual({
      servo: 0,
      blink: false,
      squeak: 0,
      gesture: null,
      motif: null,
    });
  });

  test('a saccade works the servos and drift does not', () => {
    const cues = createFoleyCues();
    cues.step(frame(), DT);
    expect(cues.step(frame({ gazeX: 0.001 }), DT).servo).toBe(0);
    expect(cues.step(frame({ gazeX: 0.08 }), DT).servo).toBeGreaterThan(0.5);
  });

  test('a blink ticks once, as the lids shut', () => {
    const cues = createFoleyCues();
    cues.step(frame(), DT);
    expect(cues.step(frame({ leftUpperLid: 0.9, rightUpperLid: 0.9 }), DT).blink).toBe(true);
    expect(cues.step(frame({ leftUpperLid: 1, rightUpperLid: 1 }), DT).blink).toBe(false);
    expect(cues.step(frame(), DT).blink).toBe(false);
  });

  test('a fast squash squeaks once, and the voice motion never does', () => {
    const cues = createFoleyCues();
    cues.step(frame(), DT);
    expect(cues.step(frame({ leftSquash: -0.005, rightSquash: -0.005 }), DT).squeak).toBe(0);
    expect(cues.step(frame({ leftSquash: 0.2, rightSquash: 0.2 }), DT).squeak).toBeGreaterThan(0);
    expect(cues.step(frame({ leftSquash: 0.4, rightSquash: 0.4 }), DT).squeak).toBe(0);
  });

  test('a gesture sounds once as it starts, and is silent when it ends', () => {
    const cues = createFoleyCues();
    cues.step(frame(), DT);
    expect(cues.step(frame({}, { gesture: 'nod' }), DT).gesture).toBe('nod');
    expect(cues.step(frame({}, { gesture: 'nod' }), DT).gesture).toBeNull();
    // Settling back to normal used to thump. It sounded like a heartbeat.
    expect(cues.step(frame(), DT).gesture).toBeNull();
  });

  test('a new emotion plays its motif once, and going back to neutral is silent', () => {
    const cues = createFoleyCues();
    cues.step(frame(), DT);
    expect(cues.step(frame({}, { emotion: 'curious' }), DT).motif).toBe('curious');
    expect(cues.step(frame({}, { emotion: 'curious' }), DT).motif).toBeNull();
    expect(cues.step(frame(), DT).motif).toBeNull();
  });

  test('switched off sounds are dropped, and the master switch drops them all', () => {
    const loud = {
      ...{ servo: 0.6, blink: true, squeak: 0.5 },
      ...{ gesture: 'nod' as const, motif: 'happy' as const },
    };
    const all = {
      on: true,
      volume: 1,
      emotion: true,
      servo: true,
      blink: true,
      squash: true,
      gesture: true,
    };
    expect(maskCues(loud, all)).toEqual(loud);
    expect(maskCues(loud, { ...all, servo: false, emotion: false })).toEqual({
      ...loud,
      servo: 0,
      motif: null,
    });
    expect(maskCues(loud, { ...all, on: false }).blink).toBe(false);
  });
});
