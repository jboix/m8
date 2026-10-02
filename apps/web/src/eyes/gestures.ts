/**
 * One-shot animations that play over whatever expression is current and hand
 * the face back unchanged. A gesture punctuates a state; it does not replace
 * one, which is why every frame it produces is a set of offsets.
 */
import type { GestureKind } from '@m8/shared';
import type { RigParams } from './rig.ts';

/** Offsets added to the current pose for one frame of a gesture. */
export type GestureFrame = Partial<RigParams>;

/** A gesture: how long it runs and what it does at each point along the way. */
export interface Gesture {
  /** Total length. */
  durationMs: number;
  /**
   * The offsets at one point in the gesture.
   * @param progress - 0 at the start, 1 at the end.
   * @returns The offsets to add to the current pose.
   */
  frame(progress: number): GestureFrame;
}

/**
 * A curve that starts at 0, peaks at 1 halfway through, and returns to 0. The
 * exponent flattens the top so a gesture holds its shape for a moment rather
 * than only touching it.
 *
 * @param progress - 0 to 1.
 * @param hold - Above 1 makes the peak broader.
 * @returns The curve's value, 0 to 1.
 */
function arc(progress: number, hold = 1): number {
  return Math.sin(Math.PI * progress) ** (1 / hold);
}

/**
 * A wobble that dies out, for gestures that shake something loose.
 *
 * @param progress - 0 to 1.
 * @param cycles - How many full swings across the gesture.
 * @returns A value between -1 and 1, fading to 0 at the end.
 */
function decayingWave(progress: number, cycles: number): number {
  return Math.sin(2 * Math.PI * cycles * progress) * (1 - progress);
}

/**
 * A blink: both edges of both eyes closing on the middle.
 *
 * @param amount - How far shut, 0 to 1.
 * @returns The offsets for that much of a blink.
 */
function blinkFrame(amount: number): GestureFrame {
  const edge = amount * 0.47;
  return {
    leftUpperLid: edge,
    rightUpperLid: edge,
    leftLowerLid: edge,
    rightLowerLid: edge,
  };
}

/** The gestures the `gesture` tool can ask for. */
export const GESTURES: Record<GestureKind, Gesture> = {
  double_take: {
    durationMs: 1000,
    // Glance off, snap back, and arrive too wide: the eyes get there before the
    // realisation does.
    frame: (progress) => {
      const away = progress < 0.4 ? arc(progress / 0.4) : 0;
      const shock = progress < 0.4 ? 0 : arc((progress - 0.4) / 0.6, 2);
      return {
        gazeX: -0.55 * away,
        leftUpperLid: -0.05 * shock,
        rightUpperLid: -0.05 * shock,
        leftPupil: 0.38 * shock,
        rightPupil: 0.38 * shock,
        leftBrowTilt: 0.35 * shock,
        rightBrowTilt: 0.35 * shock,
      };
    },
  },
  eye_roll: {
    durationMs: 1100,
    // Up first, then a sweep across the top and back down the other side.
    frame: (progress) => ({
      gazeY: -0.85 * arc(progress, 2),
      gazeX: 0.6 * Math.sin(2 * Math.PI * progress),
      leftUpperLid: 0.14 * arc(progress),
      rightUpperLid: 0.14 * arc(progress),
    }),
  },
  squint: {
    durationMs: 850,
    frame: (progress) => {
      const amount = arc(progress, 2.5);
      return {
        leftUpperLid: 0.2 * amount,
        rightUpperLid: 0.2 * amount,
        leftLowerLid: 0.22 * amount,
        rightLowerLid: 0.22 * amount,
        leftBrowTilt: -0.3 * amount,
        rightBrowTilt: -0.3 * amount,
        leftPupil: -0.2 * amount,
        rightPupil: -0.2 * amount,
      };
    },
  },
  wide_eyes: {
    durationMs: 750,
    frame: (progress) => {
      const amount = arc(progress, 2.5);
      return {
        leftUpperLid: -0.05 * amount,
        rightUpperLid: -0.05 * amount,
        leftLowerLid: -0.05 * amount,
        rightLowerLid: -0.05 * amount,
        leftPupil: 0.45 * amount,
        rightPupil: 0.45 * amount,
        leftBrowTilt: 0.3 * amount,
        rightBrowTilt: 0.3 * amount,
      };
    },
  },
  slow_blink: {
    durationMs: 1000,
    // Deliberately unhurried. The reflex blink in the brainstem takes a quarter
    // of this, which is the whole difference between a tic and a gesture.
    frame: (progress) => blinkFrame(arc(progress, 1.6)),
  },
  nod: {
    durationMs: 850,
    frame: (progress) => ({
      gazeY: 0.42 * decayingWave(progress, 2),
      leftSquash: 0.1 * arc(progress),
      rightSquash: 0.1 * arc(progress),
    }),
  },
  shake: {
    durationMs: 800,
    frame: (progress) => ({
      gazeX: 0.5 * decayingWave(progress, 2.5),
      leftUpperLid: 0.08 * arc(progress),
      rightUpperLid: 0.08 * arc(progress),
    }),
  },
  yawn: {
    durationMs: 2600,
    // The whole face lifts and stretches tall as the breath comes in, and the
    // lids squeeze shut over the top of it. The eyes let go later than the
    // stretch does, which is what makes it a yawn and not a long blink.
    frame: (progress) => {
      const stretch = arc(progress, 2);
      const squeeze = progress < 0.2 ? 0 : arc((progress - 0.2) / 0.8, 2.5);
      return {
        gazeY: -0.2 * stretch,
        leftSquash: -0.14 * stretch,
        rightSquash: -0.14 * stretch,
        leftBrowTilt: 0.45 * stretch,
        rightBrowTilt: 0.45 * stretch,
        leftUpperLid: 0.4 * squeeze,
        rightUpperLid: 0.4 * squeeze,
        leftLowerLid: 0.34 * squeeze,
        rightLowerLid: 0.34 * squeeze,
        leftPupil: -0.15 * squeeze,
        rightPupil: -0.15 * squeeze,
      };
    },
  },
};
