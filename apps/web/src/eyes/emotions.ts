/**
 * What each emotion does to the face. The character is two lit shapes on a
 * screen: no mouth, no brows, no pupils. Every one of these has to be readable
 * from the shape of an eye alone, which is the whole constraint the design is
 * built on. The values are changes from {@link RIG_REST}, scaled by intensity.
 */
import type { Emotion } from '@m8/shared';
import { clampRigValue, RIG_REST, type RigParams } from './rig.ts';

/**
 * An expression stated once and mirrored onto both eyes, because a face is
 * symmetric except where it deliberately is not.
 */
interface Expression {
  /** Added to both upper lids. Positive closes. */
  upperLid?: number;
  /** Added to both lower lids. Positive raises them toward the pupil. */
  lowerLid?: number;
  /** Added to both eye sizes. A screen has no pupil; it has brightness and scale. */
  pupil?: number;
  /** Added to both top edges. Positive lifts the inner ends, as a brow would. */
  browTilt?: number;
  /** Added to both eyes. Positive flattens, negative stretches tall. */
  squash?: number;
  /** Added to both smiles. Bows the bottom edge up without raising the lids. */
  smile?: number;
  /** Added to vertical gaze. Positive looks down. */
  gazeY?: number;
  /** Added to the right eye's tilt and subtracted from the left. One brow up. */
  asymmetry?: number;
  /**
   * Added to the right eye's size and subtracted from the left. On a face with
   * no brows, one eye opening wider than the other says more than tilting both.
   */
  sizeSkew?: number;
}

/**
 * The preset per emotion. Read this table as the character's whole emotional
 * range: if an expression is not distinguishable here, it will not be on screen.
 */
export const EMOTION_PRESETS: Record<Emotion, Expression> = {
  neutral: {},
  // Open eyes bowed up from below. Raising the lower lid to get the curve is what
  // squinted them, so the curve has a parameter of its own.
  happy: { lowerLid: 0.04, smile: 0.8, browTilt: 0.1, squash: 0.03, pupil: 0.1 },
  curious: { upperLid: -0.02, browTilt: 0.14, pupil: 0.1, sizeSkew: 0.26, gazeY: -0.06 },
  // A frown across the top, one side more than the other, and a look up from
  // under it. The eyes stay the same size: the doubt is in the brow.
  skeptical: { upperLid: 0.2, browTilt: -0.5, asymmetry: 0.22, gazeY: -0.3, pupil: -0.02 },
  sleepy: {
    upperLid: 0.3,
    lowerLid: 0.09,
    browTilt: 0.08,
    pupil: -0.22,
    gazeY: 0.18,
    squash: 0.12,
  },
  sad: { upperLid: 0.14, lowerLid: 0.04, browTilt: 0.72, pupil: -0.04, gazeY: 0.26 },
  annoyed: { upperLid: 0.22, lowerLid: 0.1, browTilt: -0.68, pupil: -0.12 },
  shy: { upperLid: 0.16, lowerLid: 0.12, browTilt: 0.42, pupil: 0.06, gazeY: 0.22, squash: 0.08 },
  excited: { upperLid: -0.02, lowerLid: 0.16, browTilt: 0.2, pupil: 0.44, squash: -0.08 },
  focused: { upperLid: 0.12, lowerLid: 0.14, browTilt: -0.34, pupil: -0.3 },
  // Looking up and away from the question, one brow lifted. Open, not narrowed:
  // focused is working on something, thinking is wondering about it.
  thinking: { upperLid: 0.05, browTilt: 0.12, asymmetry: 0.2, gazeY: -0.4, pupil: -0.05 },
  // Worried brows, a slight squint and eyes drawn in. The trembling and the
  // sweat are its flourish.
  stressed: { upperLid: 0.1, lowerLid: 0.08, browTilt: 0.4, pupil: -0.14, squash: 0.04 },
  // Taller, wider and brighter: a robot's surprise is its eyes getting bigger.
  // The exclamation mark is its flourish.
  shocked: { upperLid: -0.05, lowerLid: -0.04, browTilt: 0.34, pupil: 0.3, squash: -0.2 },
};

/** How long an expression holds before the face goes back to neutral, in seconds. */
const HOLD_SECONDS = 6;

/**
 * What is left of an expression some time after it was set.
 *
 * @remarks
 * A feeling passes. The model is told to set an expression as it starts
 * speaking, and it seldom sets neutral afterwards, so without this the last
 * expression stayed on his face for the rest of the session. Sleep is a state
 * and not a reaction: the reflexes set it while nobody is there, and presence
 * ends it.
 *
 * The target drops to neutral in one step, the same way a new expression
 * arrives, and the springs carry the face back at the speed they carry it
 * anywhere. A target that fades on its own clock keeps the springs chasing it,
 * and the face goes back slower than it came.
 *
 * @param emotion - Which expression.
 * @param intensity - The intensity it was set with.
 * @param ageSeconds - How long ago it was set.
 * @returns The intensity to show now: unchanged during the hold, then 0.
 */
export function fadedIntensity(emotion: Emotion, intensity: number, ageSeconds: number): number {
  if (emotion === 'sleepy') return intensity;
  return ageSeconds < HOLD_SECONDS ? intensity : 0;
}

/** The six per-eye values an expression produces for one side. */
interface SideTargets {
  upperLid: number;
  lowerLid: number;
  pupil: number;
  browTilt: number;
  squash: number;
  smile: number;
}

/**
 * Apply an expression to one eye.
 *
 * @param mirror - -1 for the left eye, 1 for the right. Only asymmetry uses it.
 * @param preset - The expression to apply.
 * @param amount - Intensity, already clamped to 0 to 1.
 * @returns The six values for that eye, each inside its range.
 */
function sideTargets(mirror: number, preset: Expression, amount: number): SideTargets {
  const brow = (preset.browTilt ?? 0) + mirror * (preset.asymmetry ?? 0);
  const size = (preset.pupil ?? 0) + mirror * (preset.sizeSkew ?? 0);
  return {
    upperLid: clampRigValue(
      'leftUpperLid',
      RIG_REST.leftUpperLid + (preset.upperLid ?? 0) * amount,
    ),
    lowerLid: clampRigValue(
      'leftLowerLid',
      RIG_REST.leftLowerLid + (preset.lowerLid ?? 0) * amount,
    ),
    pupil: clampRigValue('leftPupil', RIG_REST.leftPupil + size * amount),
    browTilt: clampRigValue('leftBrowTilt', RIG_REST.leftBrowTilt + brow * amount),
    squash: clampRigValue('leftSquash', RIG_REST.leftSquash + (preset.squash ?? 0) * amount),
    smile: clampRigValue('leftSmile', RIG_REST.leftSmile + (preset.smile ?? 0) * amount),
  };
}

/**
 * The pose an emotion asks for. Blending between two emotions is not done here:
 * the springs are already between the old targets and the new ones, so handing
 * them a different pose is the blend.
 *
 * @param emotion - Which expression.
 * @param intensity - 0 leaves the face at rest, 1 is the full preset. Values
 * outside the range are clamped.
 * @returns A complete pose. `gazeX` is always at rest, because where the
 * character looks is the gaze arbiter's business, not the emotion's.
 */
export function emotionTargets(emotion: Emotion, intensity: number): RigParams {
  const preset = EMOTION_PRESETS[emotion];
  const amount = Math.min(1, Math.max(0, intensity));
  const left = sideTargets(-1, preset, amount);
  const right = sideTargets(1, preset, amount);

  return {
    gazeX: RIG_REST.gazeX,
    gazeY: clampRigValue('gazeY', RIG_REST.gazeY + (preset.gazeY ?? 0) * amount),
    leftUpperLid: left.upperLid,
    leftLowerLid: left.lowerLid,
    leftPupil: left.pupil,
    leftBrowTilt: left.browTilt,
    leftSquash: left.squash,
    leftSmile: left.smile,
    rightUpperLid: right.upperLid,
    rightLowerLid: right.lowerLid,
    rightPupil: right.pupil,
    rightBrowTilt: right.browTilt,
    rightSquash: right.squash,
    rightSmile: right.smile,
  };
}
