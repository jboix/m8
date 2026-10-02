/**
 * Decides which sounds the eyes make, from how they move.
 *
 * Pure: a pose stream goes in, cues come out. No audio here, no clock and no
 * randomness, so the same recording always asks for the same sounds.
 */
import type { Emotion, GestureKind } from '@m8/shared';
import type { RigParams } from '../eyes/index.ts';

/** What the rig looks like on one frame. */
export interface FoleyFrame {
  /** The pose as last drawn. */
  pose: RigParams;
  /** The emotion currently held. */
  emotion: Emotion;
  /** The gesture playing, or null. */
  gesture: GestureKind | null;
}

/** What one frame asks the synth for. */
export interface FoleyCues {
  /** How hard the servos are working, 0 still to 1 a full saccade. Continuous. */
  servo: number;
  /** True on the frame the lids shut. */
  blink: boolean;
  /** How hard the eyes were squashed this frame, 0 for no squeak. */
  squeak: number;
  /** The gesture that just started, or null. Nothing sounds when one ends. */
  gesture: GestureKind | null;
  /** The emotion he just changed to, or null. Neutral is silent. */
  motif: Emotion | null;
}

/** Gaze slower than this, in gaze units a second, is drift and makes no sound. */
const SERVO_FLOOR = 0.5;

/** Gaze this far over the floor is a full saccade. */
const SERVO_SPAN = 5;

/** The lids count as shut above this. */
const LIDS_SHUT = 0.7;

/** Squash changing slower than this, per second, is the voice motion, not a squeak. */
const SQUEAK_FLOOR = 1.4;

/** Squash this far over the floor is the loudest squeak. */
const SQUEAK_SPAN = 4;

/** The least time between two squeaks, in seconds. A wobble is one squeak. */
const SQUEAK_REST = 0.3;

/** Turns frames into cues, remembering the frame before. */
export interface FoleyCueTracker {
  /**
   * Take one frame.
   * @param frame - The rig now.
   * @param deltaSeconds - Time since the last frame.
   * @returns What to play for it.
   */
  step(frame: FoleyFrame, deltaSeconds: number): FoleyCues;
}

/** Nothing to play. */
const SILENT: FoleyCues = { servo: 0, blink: false, squeak: 0, gesture: null, motif: null };

/**
 * Hold a number inside 0 to 1.
 *
 * @param value - Any number.
 * @returns The nearest number inside the range.
 */
function unit(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/**
 * How closed the lids are, as one number.
 *
 * @param pose - The pose.
 * @returns The mean of the two upper lids.
 */
function lids(pose: RigParams): number {
  return (pose.leftUpperLid + pose.rightUpperLid) / 2;
}

/**
 * How squashed the eyes are, as one number.
 *
 * @param pose - The pose.
 * @returns The mean of the two eyes.
 */
function squash(pose: RigParams): number {
  return (pose.leftSquash + pose.rightSquash) / 2;
}

/**
 * How hard the servos worked between two poses.
 *
 * @param before - The previous pose.
 * @param now - This pose.
 * @param deltaSeconds - Time between them.
 * @returns 0 for drift, up to 1 for a full saccade.
 */
function servoWork(before: RigParams, now: RigParams, deltaSeconds: number): number {
  const speed = Math.hypot(now.gazeX - before.gazeX, now.gazeY - before.gazeY) / deltaSeconds;
  return unit((speed - SERVO_FLOOR) / SERVO_SPAN);
}

/**
 * How hard the eyes were squashed between two poses.
 *
 * @param before - The previous pose.
 * @param now - This pose.
 * @param deltaSeconds - Time between them.
 * @param rested - Seconds since the last squeak.
 * @returns 0 for no squeak, up to 1 for the loudest.
 */
function squeakOf(before: RigParams, now: RigParams, deltaSeconds: number, rested: number): number {
  const speed = Math.abs(squash(now) - squash(before)) / deltaSeconds;
  if (speed <= SQUEAK_FLOOR || rested < SQUEAK_REST) return 0;
  // Never quite zero, because zero means no squeak at all.
  return Math.max(0.05, unit((speed - SQUEAK_FLOOR) / SQUEAK_SPAN));
}

/**
 * The emotion he just changed to.
 *
 * @param before - The previous frame.
 * @param now - This frame.
 * @returns The new emotion, or null when it did not change or settled to neutral.
 */
function changedTo(before: FoleyFrame, now: FoleyFrame): Emotion | null {
  return now.emotion !== before.emotion && now.emotion !== 'neutral' ? now.emotion : null;
}

/**
 * Start tracking.
 *
 * @returns The tracker. Its first frame is silent, because there is nothing to
 * compare it with, and an emotion he already had is not a change.
 */
export function createFoleyCues(): FoleyCueTracker {
  let before: FoleyFrame | null = null;
  let sinceSqueak = SQUEAK_REST;

  return {
    step(frame, deltaSeconds) {
      const previous = before;
      before = frame;
      sinceSqueak += deltaSeconds;
      if (!previous || deltaSeconds <= 0) return SILENT;

      const squeak = squeakOf(previous.pose, frame.pose, deltaSeconds, sinceSqueak);
      if (squeak > 0) sinceSqueak = 0;
      return {
        servo: servoWork(previous.pose, frame.pose, deltaSeconds),
        blink: lids(previous.pose) < LIDS_SHUT && lids(frame.pose) >= LIDS_SHUT,
        squeak,
        gesture: frame.gesture !== previous.gesture ? frame.gesture : null,
        motif: changedTo(previous, frame),
      };
    },
  };
}

/** Which sounds are on. Everything off leaves the character as it was. */
export interface FoleySettings {
  /** The master switch. */
  on: boolean;
  /** How loud all of them are, 0 silent to 1 as designed. */
  volume: number;
  /** A motif when the emotion changes. */
  emotion: boolean;
  /** The servo whir that follows the gaze. */
  servo: boolean;
  /** The tick of a blink. */
  blink: boolean;
  /** The squeak of a fast squash. */
  squash: boolean;
  /** A short sound as a gesture starts. */
  gesture: boolean;
}

/**
 * Drop the cues whose sounds are switched off.
 *
 * @param cues - What the frame asked for.
 * @param settings - Which sounds are on.
 * @returns The cues that may be heard.
 */
export function maskCues(cues: FoleyCues, settings: FoleySettings): FoleyCues {
  if (!settings.on) return SILENT;
  return {
    servo: settings.servo ? cues.servo : 0,
    blink: settings.blink && cues.blink,
    squeak: settings.squash ? cues.squeak : 0,
    gesture: settings.gesture ? cues.gesture : null,
    motif: settings.emotion ? cues.motif : null,
  };
}
