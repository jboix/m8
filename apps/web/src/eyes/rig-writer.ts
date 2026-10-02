/**
 * The only place in the app that writes to the DOM every frame. React renders
 * the SVG once; this turns a pose into one path and two transforms per eye,
 * which is cheap enough that the rig is never the reason a frame is late.
 */
import { BROW_DEGREES, EYE, eyePath, GAZE_TRAVEL, LID, SIZE, SQUASH } from './geometry.ts';
import type { RigParams } from './rig.ts';

/** The elements of one eye that move. */
export interface EyeHandles {
  /** Translated by the gaze, scaled by size and squash. */
  group: SVGGElement;
  /** The lit shape. Its outline is rewritten every frame. */
  shape: SVGPathElement;
  /** A copy of the shape behind it, blurred, carrying the glow. */
  glow: SVGPathElement;
  /** The specular block that rides the top edge. */
  highlight: SVGRectElement;
}

/** Both eyes. Populated by the view as it mounts. */
export interface RigHandles {
  /** The character's left eye, on the viewer's left. */
  left: EyeHandles;
  /** The character's right eye. */
  right: EyeHandles;
}

/**
 * Hold a value inside a range.
 *
 * @param value - The value.
 * @param min - Lower bound.
 * @param max - Upper bound.
 * @returns The value, brought inside the bounds.
 */
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** The five parameters of one eye, pulled out of a pose. */
interface EyePose {
  upperLid: number;
  lowerLid: number;
  pupil: number;
  browTilt: number;
  squash: number;
  smile: number;
}

/**
 * Split a pose into one eye's share.
 *
 * @param pose - The full pose.
 * @param side - Which eye.
 * @returns That eye's five parameters.
 */
function eyePose(pose: RigParams, side: 'left' | 'right'): EyePose {
  if (side === 'left') {
    return {
      upperLid: pose.leftUpperLid,
      lowerLid: pose.leftLowerLid,
      pupil: pose.leftPupil,
      browTilt: pose.leftBrowTilt,
      squash: pose.leftSquash,
      smile: pose.leftSmile,
    };
  }
  return {
    upperLid: pose.rightUpperLid,
    lowerLid: pose.rightLowerLid,
    pupil: pose.rightPupil,
    browTilt: pose.rightBrowTilt,
    squash: pose.rightSquash,
    smile: pose.rightSmile,
  };
}

/**
 * Turn one eye's parameters into an outline.
 *
 * @param eye - That eye's parameters.
 * @returns The edges and bows for this frame.
 */
function outlineFor(eye: EyePose) {
  const top = -EYE.halfHeight + eye.upperLid * LID.travel;
  const floor = EYE.halfHeight - eye.lowerLid * LID.travel;
  const bottom = Math.max(floor, top + EYE.minOpening);
  return { top, bottom, smile: eye.lowerLid * LID.smile, bow: eye.smile * LID.bow };
}

/** Where one eye is drawn this frame, in the character's own coordinates. */
export interface EyePlacement {
  /** The eye's centre across, from the middle of the pair. */
  x: number;
  /** The eye's centre down. */
  y: number;
  /** How wide it is drawn, as a scale. */
  scaleX: number;
  /** How tall it is drawn, as a scale. */
  scaleY: number;
  /** The top edge inside the eye's own space, before the scale. */
  top: number;
  /** The bottom edge inside the eye's own space, before the scale. */
  bottom: number;
  /** The outline, as a path. */
  path: string;
}

/**
 * Work out where one eye is drawn.
 *
 * @remarks
 * Shared with the flourishes, which hang props off the eyes and must agree
 * with the rig about where an eye is.
 *
 * @param pose - The full pose.
 * @param side - Which eye.
 * @returns Its centre, its scale and its outline.
 */
export function eyePlacement(pose: RigParams, side: 'left' | 'right'): EyePlacement {
  const eye = eyePose(pose, side);
  const mirror = side === 'left' ? -1 : 1;
  const outline = outlineFor(eye);
  const size = SIZE.min + eye.pupil * (SIZE.max - SIZE.min);
  return {
    x: EYE.halfGap * mirror + pose.gazeX * GAZE_TRAVEL.x,
    y: pose.gazeY * GAZE_TRAVEL.y,
    scaleX: size * (1 + eye.squash * SQUASH.x),
    scaleY: size * (1 - eye.squash * SQUASH.y),
    top: outline.top,
    bottom: outline.bottom,
    path: eyePath(outline),
  };
}

/**
 * Draw one eye.
 *
 * @param handles - The eye's elements.
 * @param pose - The full pose, for the gaze both eyes share.
 * @param eye - That eye's parameters.
 * @param mirror - -1 for the left eye, 1 for the right.
 */
function writeEye(handles: EyeHandles, pose: RigParams, eye: EyePose, mirror: number): void {
  const placed = eyePlacement(pose, mirror < 0 ? 'left' : 'right');
  const outline = { top: placed.top, bottom: placed.bottom };
  const { path, scaleX, scaleY, x, y } = placed;
  handles.shape.setAttribute('d', path);
  handles.glow.setAttribute('d', path);

  // A positive tilt raises the inner end, and the inner end is on opposite
  // sides of the two eyes, so the rotation mirrors.
  const degrees = eye.browTilt * BROW_DEGREES * mirror;
  handles.group.setAttribute(
    'transform',
    `translate(${x} ${y}) rotate(${degrees}) scale(${scaleX} ${scaleY})`,
  );

  // Bigger eyes burn brighter, which is the other half of what pupil size means
  // on a display.
  const glow = SIZE.glowMin + eye.pupil * (SIZE.glowMax - SIZE.glowMin);
  handles.glow.setAttribute('opacity', String(clamp(glow, 0, 1)));

  // The highlight rides just under the top edge, so it reads as light on a
  // surface rather than as a sticker on the shape. It fades out as the eye
  // closes, because there is no surface left to catch it.
  const opening = outline.bottom - outline.top;
  handles.highlight.setAttribute('y', String(outline.top + 18));
  handles.highlight.setAttribute('opacity', String(clamp(opening / EYE.halfHeight - 0.9, 0, 0.4)));
}

/**
 * Write a pose onto the rig.
 *
 * @param handles - The elements of both eyes.
 * @param pose - The pose to draw. Already clamped by the caller.
 */
export function applyRig(handles: RigHandles, pose: RigParams): void {
  writeEye(handles.left, pose, eyePose(pose, 'left'), -1);
  writeEye(handles.right, pose, eyePose(pose, 'right'), 1);
}
