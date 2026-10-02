/**
 * The measurements the character is drawn from. It is a screen, not a face:
 * each eye is one lit shape, and every expression is that shape's outline
 * changing. Both the view and the writer read this file, so the proportions
 * live in one place.
 */

/**
 * The character's own coordinate space. The viewport is fitted to it rather
 * than the other way round, so the eyes are as large as the screen allows on a
 * phone held upright and on a wide monitor alike.
 */
export const STAGE = {
  /** Centre of the drawing, which both eyes are arranged around. */
  centerX: 500,
  /** Vertical centre. */
  centerY: 330,
  /** Narrowest window that still holds the pair with air around it. */
  minWidth: 880,
  /** Shortest window that still holds the pair with air around it. */
  minHeight: 600,
} as const;

/**
 * The viewBox that shows the character as large as a container allows.
 *
 * @param width - The container's width in pixels.
 * @param height - Its height.
 * @returns A viewBox centred on the character, matching the container's aspect
 * ratio so `meet` never leaves a margin on both axes.
 */
export function stageViewBox(width: number, height: number): string {
  const aspect = width > 0 && height > 0 ? width / height : STAGE.minWidth / STAGE.minHeight;
  const boxWidth = Math.max(STAGE.minWidth, STAGE.minHeight * aspect);
  const boxHeight = boxWidth / aspect;
  return `${STAGE.centerX - boxWidth / 2} ${STAGE.centerY - boxHeight / 2} ${boxWidth} ${boxHeight}`;
}

/** One eye at rest. */
export const EYE = {
  /** Distance from the centre line to each eye. */
  halfGap: 134,
  /** Half-width of the lit shape. */
  halfWidth: 90,
  /** Half-height at full opening. */
  halfHeight: 118,
  /** Corner rounding. Large enough that the shape is a lozenge, not a box. */
  /** The thinnest the eye gets. A shut eye is a line, never nothing. */
  minOpening: 9,
} as const;

/** How the lids move the outline as they close. */
export const LID = {
  /** Vertical travel of each edge, per unit of lid. Half closes the eye. */
  travel: EYE.halfHeight * 2,
  /**
   * How far a raised lower lid pulls the middle of the bottom edge up, per unit
   * of lid. Past the eye's waist it turns the shape into an upward crescent,
   * which is the only smile a face with no mouth has.
   */
  smile: 270,
  /**
   * How far a full smile bows the middle of the bottom edge up, with the lids
   * left where they are. This is what lets an eye smile without squinting.
   */
  bow: 52,
} as const;

/**
 * How far out from the middle the bottom edge stays down when it bows, as a
 * share of the half width. The bow rises between these two points.
 */
const BOW_FOOT = 0.74;

/** The bow at which the feet have moved all the way out. Below it they are on their way. */
const BOW_SPREADS_BY = 18;

/**
 * The openings between which the bow fades, as shares of a fully open eye.
 *
 * @remarks
 * A reflex blink is a quarter of a second through the lid springs, so the eye
 * only ever gets down to about a fifth open. The bow has to be gone well before
 * that, or a smiling eye blinks with a dent still in its bottom edge. It is
 * whole again by the time the eye is most of the way open, so an eye whose lid
 * is riding a downward gaze still smiles.
 */
const BOW_FADES = { goneAt: 0.5, wholeAt: 0.8 } as const;

/**
 * How much of its bow an eye keeps at a given opening.
 *
 * @param opening - The distance between the top and bottom edges.
 * @returns 0 when half shut or more, 1 when nearly open, and a smooth step between.
 */
function bowShare(opening: number): number {
  const open = opening / (EYE.halfHeight * 2);
  const along = (open - BOW_FADES.goneAt) / (BOW_FADES.wholeAt - BOW_FADES.goneAt);
  const clamped = Math.min(1, Math.max(0, along));
  return clamped * clamped * (3 - 2 * clamped);
}

/**
 * How far the curve handles reach, as a fraction of each half-axis.
 *
 * @remarks
 * 0.552 would draw an ellipse. Past that the sides flatten and the corners
 * tighten, which is the rounded-rectangle look a small display gives. It is one
 * number rather than a corner radius because a radius has to be clamped as the
 * eye closes, and clamping is what put a kink in the outline.
 */
const SQUIRCLE = 0.76;

/**
 * How far a tilted brow rotates the whole eye, in degrees.
 *
 * @remarks
 * The eye tilts as one rigid shape rather than having its top edge dragged
 * down at one end. Deforming the outline warps the corners into a boot; a
 * rotation cannot break, and a tilted lozenge is what reads as a brow on a
 * face that has none.
 */
export const BROW_DEGREES = 15;

/** How far the eyes travel with the gaze. */
export const GAZE_TRAVEL = {
  /** Horizontal travel. There is no sclera to stay inside, so it is generous. */
  x: 54,
  /** Vertical travel. */
  y: 38,
} as const;

/** How `squash` deforms an eye. */
export const SQUASH = {
  /** Widening per unit of squash. */
  x: 0.16,
  /** Flattening per unit of squash. */
  y: 0.4,
} as const;

/**
 * What `pupilSize` means on a screen that has no pupil: the whole eye swells
 * and brightens. A robot's surprise is its eyes getting bigger.
 */
export const SIZE = {
  /** Scale at `pupilSize` 0. */
  min: 0.78,
  /** Scale at `pupilSize` 1. */
  max: 1.3,
  /** Glow strength at `pupilSize` 0. */
  glowMin: 0.4,
  /** Glow strength at `pupilSize` 1. */
  glowMax: 1.15,
} as const;

/** The shape of one eye for a single frame. */
export interface EyeOutline {
  /** Vertical position of the top edge. */
  top: number;
  /** Vertical position of the bottom edge at the sides. */
  bottom: number;
  /** How far the middle of the bottom edge is pulled up above `bottom`. */
  smile: number;
  /**
   * How far the middle of the bottom edge bows up while its ends stay down.
   * Optional and zero at rest, which leaves the outline exactly as it was.
   */
  bow?: number;
}

/** What the bottom edge is drawn from. */
interface BottomEdge {
  /** The eye's half width. */
  width: number;
  /** The height of the sides' middles, where the edge starts and ends. */
  waist: number;
  /** How far below the waist the sides' tangent handles reach. */
  lower: number;
  /** Where the bottom edge sits. */
  floor: number;
  /** How far the middle rises above the floor. Zero for the plain edge. */
  bow: number;
}

/**
 * The bottom edge, from the right side round to the left.
 *
 * @remarks
 * With no bow the feet are both at the middle and this is the two curves it
 * always was. As the bow grows the feet move out, and the edge rises between
 * them in a wide, shallow arch. Every tangent is horizontal where two curves
 * meet, so the bowed edge is as smooth as the plain one, and the plain one is
 * what the bowed one shrinks back to.
 *
 * @param edge - Where the edge sits and how far it bows.
 * @returns The path segments, ending at the left side's waist.
 */
function bottomEdge(edge: BottomEdge): string[] {
  const { width, waist, floor } = edge;
  const reach = width * SQUIRCLE;
  const shoulder = waist + edge.lower;
  // How far the feet have moved out, 0 to 1. A spring settling leaves a bow of
  // a fraction of a unit, and the feet have to come back in with it, or an eye
  // at rest keeps a flat bottom between two feet that should not be there.
  const spread = Math.min(1, Math.max(0, edge.bow) / BOW_SPREADS_BY);
  const foot = width * BOW_FOOT * spread;
  const knee = reach + (foot + (width - foot) * 0.85 - reach) * spread;
  const crest = floor - Math.max(0, edge.bow);
  return [
    `C ${width} ${shoulder} ${knee} ${floor} ${foot} ${floor}`,
    `C ${foot * 0.8} ${floor} ${foot * 0.62} ${crest} 0 ${crest}`,
    `C ${-foot * 0.62} ${crest} ${-foot * 0.8} ${floor} ${-foot} ${floor}`,
    `C ${-knee} ${floor} ${-width} ${shoulder} ${-width} ${waist}`,
  ];
}

/**
 * The eye's outline as an SVG path.
 *
 * @remarks
 * One closed curve through four anchors, at the middle of each edge, with
 * tangents that are horizontal at the top and bottom and vertical at the sides.
 * Every point on it is smooth at any opening, so a closing eye narrows into a
 * lens instead of collapsing into a shape with corners in it. There is no
 * separate lid and no corner radius: the lid is where the anchors are, which is
 * also why nothing here needs clamping as the eye shuts.
 *
 * @param outline - Where this frame's edges sit.
 * @returns The path's `d`, in the eye's own coordinates.
 */
export function eyePath(outline: EyeOutline): string {
  const width = EYE.halfWidth;
  const { top, bottom } = outline;
  const waist = (top + bottom) / 2;
  const floor = Math.max(top + EYE.minOpening, bottom - outline.smile);
  const reach = width * SQUIRCLE;
  // Negative once the smile lifts the floor past the waist, which is what turns
  // the handles over and makes the bottom edge a crescent.
  const lower = (floor - waist) * SQUIRCLE;
  const upper = (waist - top) * SQUIRCLE;
  const bow = (outline.bow ?? 0) * bowShare(bottom - top);

  return [
    `M 0 ${top}`,
    `C ${reach} ${top} ${width} ${waist - upper} ${width} ${waist}`,
    ...bottomEdge({ width, waist, lower, floor, bow }),
    `C ${-width} ${waist - upper} ${-reach} ${top} 0 ${top}`,
    'Z',
  ].join(' ');
}
