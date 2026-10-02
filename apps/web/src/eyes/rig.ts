/**
 * The parameter set the whole character is made of. Fourteen numbers: two for
 * where it looks and six per eye, the sixth being the smile. Nothing else about
 * the face is animated,
 * which is the constraint that forces the expression into lids, brows, pupil
 * size and timing.
 */
import type { SpringConfig } from './spring.ts';

/**
 * The face at rest: looking straight ahead, lids barely down, pupils mid-size.
 * Every emotion is stated as a change from here.
 */
export const RIG_REST = {
  /** Horizontal gaze. -1 hard left, 1 hard right. */
  gazeX: 0,
  /** Vertical gaze. -1 up, 1 down. */
  gazeY: 0,
  /** Left upper lid. 0 wide open, 1 shut. */
  leftUpperLid: 0.02,
  /** Left lower lid. 0 down, 1 raised to the pupil. */
  leftLowerLid: 0.015,
  /** Left pupil size. 0 pinprick, 1 blown. */
  leftPupil: 0.5,
  /** Left brow. -1 inner end down (angry), 1 inner end up (worried). */
  leftBrowTilt: 0,
  /** Left eye squash. Negative stretches tall, positive flattens. */
  leftSquash: 0,
  /** Left smile. 0 a flat bottom edge, 1 bowed up into a crescent, lids where they were. */
  leftSmile: 0,
  /** Right upper lid. 0 wide open, 1 shut. */
  rightUpperLid: 0.02,
  /** Right lower lid. 0 down, 1 raised to the pupil. */
  rightLowerLid: 0.015,
  /** Right pupil size. 0 pinprick, 1 blown. */
  rightPupil: 0.5,
  /** Right brow. -1 inner end down (angry), 1 inner end up (worried). */
  rightBrowTilt: 0,
  /** Right eye squash. Negative stretches tall, positive flattens. */
  rightSquash: 0,
  /** Right smile. 0 a flat bottom edge, 1 bowed up into a crescent, lids where they were. */
  rightSmile: 0,
} as const;

/** One complete pose of the rig. */
export type RigParams = Record<keyof typeof RIG_REST, number>;

/** The name of a single animated parameter. */
export type RigParamName = keyof RigParams;

/** Every parameter, in the order the debug sliders show them. */
export const RIG_PARAM_NAMES = Object.keys(RIG_REST) as RigParamName[];

/** Parameters that behave the same way are tuned and bounded together. */
type ParamKind = 'gaze' | 'lid' | 'pupil' | 'brow' | 'squash';

/** What each kind of parameter is allowed to be. */
const RANGES: Record<ParamKind, { min: number; max: number }> = {
  gaze: { min: -1, max: 1 },
  lid: { min: 0, max: 1 },
  pupil: { min: 0, max: 1 },
  brow: { min: -1, max: 1 },
  squash: { min: -0.5, max: 1 },
};

/**
 * How each kind of parameter moves. The numbers are the timing of the
 * character: eyelids are the fastest thing on a face, pupils the slowest, and
 * brows ring a little because that reads as life rather than as mechanism.
 */
const SPRINGS: Record<ParamKind, SpringConfig> = {
  gaze: { stiffness: 190, dampingRatio: 0.62 },
  lid: { stiffness: 480, dampingRatio: 0.82 },
  pupil: { stiffness: 110, dampingRatio: 0.72 },
  brow: { stiffness: 150, dampingRatio: 0.52 },
  squash: { stiffness: 175, dampingRatio: 0.6 },
};

/**
 * Classify a parameter by name.
 *
 * @param name - The parameter.
 * @returns Which family it belongs to.
 */
function kindOf(name: RigParamName): ParamKind {
  if (name === 'gazeX' || name === 'gazeY') return 'gaze';
  // A smile moves like a lid: it is the same edge of the same eye.
  if (name.endsWith('Lid') || name.endsWith('Smile')) return 'lid';
  if (name.endsWith('Pupil')) return 'pupil';
  if (name.endsWith('BrowTilt')) return 'brow';
  return 'squash';
}

/**
 * The bounds a parameter is clamped to. The debug sliders use the same numbers.
 *
 * @param name - The parameter.
 * @returns Its inclusive minimum and maximum.
 */
export function rigRange(name: RigParamName): { min: number; max: number } {
  return RANGES[kindOf(name)];
}

/**
 * The spring a parameter is driven through.
 *
 * @param name - The parameter.
 * @param reducedMotion - When true, damping goes critical so nothing overshoots.
 * @returns The spring configuration to step with.
 */
export function rigSpring(name: RigParamName, reducedMotion: boolean): SpringConfig {
  const config = SPRINGS[kindOf(name)];
  return reducedMotion ? { stiffness: config.stiffness, dampingRatio: 1 } : config;
}

/**
 * Hold a value inside its parameter's range.
 *
 * @param name - The parameter the value belongs to.
 * @param value - The value to clamp.
 * @returns The value, brought inside the range.
 */
export function clampRigValue(name: RigParamName, value: number): number {
  const { min, max } = rigRange(name);
  return Math.min(max, Math.max(min, value));
}
