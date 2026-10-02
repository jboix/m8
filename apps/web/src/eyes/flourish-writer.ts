/**
 * Draws the flourishes. Like the rig writer, it sets attributes on elements
 * that already exist, once per frame, and never touches React.
 *
 * There are three kinds. A tint recolours the eye and its bloom. A mark
 * is drawn inside the eye and clipped to it, so it rides the lids, the gaze and
 * the squash for free. A prop is drawn beside the eyes, and has to decide where
 * a cheek is on a face that has no outline: see {@link CHEEK}.
 */
import type { Bubble, FlourishState } from './flourishes.ts';
import { EYE } from './geometry.ts';
import type { RigParams } from './rig.ts';
import { type EyePlacement, eyePlacement, type RigHandles } from './rig-writer.ts';

/** The elements the flourishes are drawn with. */
export interface FlourishHandles {
  /** The three stops of the eye's gradient, top to bottom. */
  stops: SVGStopElement[];
  /** The clip path of each eye, kept on the eye's outline. */
  clips: Record<'left' | 'right', SVGPathElement>;
  /** The star that replaces the highlight when he is excited, one per eye. */
  stars: Record<'left' | 'right', SVGPolygonElement>;
  /** The pair of tiny stars that replaces it when he is happy, one per eye. */
  twinkles: Record<'left' | 'right', SVGGElement>;
  /** The question mark that hangs over the right eye when he is skeptical. */
  question: SVGGElement;
  /** The blush under each eye. */
  blush: Record<'left' | 'right', SVGGElement>;
  /** The tear. */
  tear: SVGPathElement;
  /** The bubbles, as many as the state can hold. */
  bubbles: SVGCircleElement[];
  /** The thinking dots. */
  dots: SVGCircleElement[];
  /** The exclamation mark that pops up over the left eye when he is shocked. */
  exclamation: SVGGElement;
  /** The sweat drop at the side of the right eye when he is stressed. */
  sweat: SVGPathElement;
  /** The group around both eyes and their props, which trembles when he is stressed. */
  shaker: SVGGElement;
}

/** A colour as red, green and blue, 0 to 255. */
type Rgb = [number, number, number];

/** The eye's own colours, top to bottom, then its bloom. */
const BLUE: Rgb[] = [
  [168, 244, 255],
  [56, 205, 255],
  [10, 127, 220],
  [56, 205, 255],
];

/** Annoyed: the eyes shift red. */
const RED: Rgb[] = [
  [255, 186, 168],
  [255, 78, 58],
  [196, 22, 18],
  [255, 70, 50],
];

/** Excited: the eyes shift yellow. */
const YELLOW: Rgb[] = [
  [255, 250, 190],
  [255, 214, 64],
  [232, 146, 0],
  [255, 208, 60],
];

/**
 * Where a cheek is. The character has no face outline, so this is a decision:
 * a cheek sits just under its eye and a little outward, and it follows the gaze
 * with the eye, so the pair and their cheeks still read as one head turning.
 */
const CHEEK = {
  /** How far under the eye's resting bottom edge. */
  below: 46,
  /** How far outward from the eye's centre. */
  outward: 26,
} as const;

/** How large a full tear is drawn, against the path's own size. */
const TEAR_SIZE = 1.3;

/** How far a tear falls before it is gone, in the character's units. */
const TEAR_FALL = 190;

/** How far a bubble drifts up before it pops. */
const BUBBLE_RISE = 230;

/** How far a sweat drop slides down the side of the eye before it is gone. */
const SWEAT_SLIDE = 150;

/**
 * The trembling: how far the pair moves at most, in the character's units,
 * and the frequencies it mixes, in hertz. Two frequencies that never line up
 * make a shake that does not read as a loop.
 */
const TREMBLE = { reach: 4, x: [4.1, 6.7], y: [5.3, 3.1] } as const;

/**
 * Mix two colours.
 *
 * @param from - The colour at 0.
 * @param to - The colour at 1.
 * @param amount - 0 to 1.
 * @returns The colour between them.
 */
function mix(from: Rgb, to: Rgb, amount: number): Rgb {
  return [0, 1, 2].map((channel) =>
    Math.round((from[channel] ?? 0) + ((to[channel] ?? 0) - (from[channel] ?? 0)) * amount),
  ) as Rgb;
}

/**
 * Write the tint: the gradient's three stops and the bloom behind both eyes.
 *
 * @param handles - The stops.
 * @param rig - The eyes, for their blooms.
 * @param level - How much of each flourish is showing.
 */
function writeTint(handles: FlourishHandles, rig: RigHandles, level: FlourishState['level']): void {
  const colours = BLUE.map((blue, index) => {
    const red = mix(blue, RED[index] ?? blue, level.annoyed);
    return `rgb(${mix(red, YELLOW[index] ?? red, level.excited).join(' ')})`;
  });
  handles.stops.forEach((stop, index) => {
    stop.setAttribute('stop-color', colours[index] ?? '');
  });
  const bloom = colours[3] ?? '';
  rig.left.glow.style.fill = bloom;
  rig.right.glow.style.fill = bloom;
}

/**
 * Place one glare where the highlight is, growing as it fades in.
 *
 * @param mark - The glare's element.
 * @param placed - Where its eye is drawn.
 * @param level - How much of it is showing, 0 to 1.
 */
function writeGlare(mark: SVGElement, placed: EyePlacement, level: number): void {
  mark.setAttribute('opacity', String(level));
  mark.setAttribute(
    'transform',
    `translate(${-EYE.halfWidth * 0.22} ${placed.top + 48}) scale(${0.4 + 0.6 * level})`,
  );
}

/**
 * Write the marks inside one eye: its clip, and whichever glare has replaced
 * its highlight.
 *
 * @param handles - The flourish elements.
 * @param rig - The eyes, for the highlight the glares replace.
 * @param side - Which eye.
 * @param placed - Where that eye is drawn.
 * @param level - How much of each flourish is showing.
 */
function writeMarks(
  handles: FlourishHandles,
  rig: RigHandles,
  side: 'left' | 'right',
  placed: EyePlacement,
  level: FlourishState['level'],
): void {
  handles.clips[side].setAttribute('d', placed.path);
  writeGlare(handles.stars[side], placed, level.excited);
  writeGlare(handles.twinkles[side], placed, level.happy);
  const replaced = Math.max(level.excited, level.happy);
  if (replaced === 0) return;
  // A glare replaces the highlight instead of sitting on top of it.
  const highlight = rig[side].highlight;
  const lit = Number(highlight.getAttribute('opacity') ?? 0);
  highlight.setAttribute('opacity', String(lit * (1 - replaced)));
}

/**
 * Write the question mark. It hangs over the right eye, a little outward and
 * tipped, and pops up out of the eye as it appears.
 *
 * @param question - The question mark.
 * @param placed - Where the right eye is drawn.
 * @param level - How much of it is showing.
 */
function writeQuestion(question: SVGGElement, placed: EyePlacement, level: number): void {
  const x = placed.x + EYE.halfWidth * 0.55;
  const top = placed.y + placed.top * placed.scaleY;
  // It rises as it fades in, and lands with its dot clear of the eye.
  const y = top - 58 - 20 * level;
  question.setAttribute('transform', `translate(${x} ${y}) rotate(12) scale(${0.6 + 0.6 * level})`);
  question.setAttribute('opacity', String(level));
}

/**
 * Write the exclamation mark. It stands over the outer top corner of the left
 * eye, tipped outward, and pops up past its size before it settles. Low and to
 * the side rather than straight above, because a shocked eye is tall and a
 * mark above it leaves the top of a wide window.
 *
 * @param exclamation - The exclamation mark.
 * @param placed - Where the left eye is drawn.
 * @param level - How much of it is showing.
 */
function writeExclamation(exclamation: SVGGElement, placed: EyePlacement, level: number): void {
  const x = placed.x - EYE.halfWidth * 0.9 * placed.scaleX - 10;
  const top = placed.y + placed.top * placed.scaleY;
  const y = top - 30 - 10 * level;
  // A bump in the middle of the fade in: it overshoots and lands.
  const size = 0.4 + 0.5 * level + 0.25 * Math.sin(level * Math.PI);
  exclamation.setAttribute('transform', `translate(${x} ${y}) rotate(-14) scale(${size})`);
  exclamation.setAttribute('opacity', String(level));
}

/**
 * Write the sweat drop. It wells at the outer side of the right eye, near the
 * top, then slides down the side and fades.
 *
 * @param sweat - The drop's path.
 * @param placed - Where the right eye is drawn.
 * @param state - The flourish state.
 */
function writeSweat(sweat: SVGPathElement, placed: EyePlacement, state: FlourishState): void {
  const welling = Math.min(1, state.sweat);
  const sliding = Math.min(1, Math.max(0, state.sweat - 1));
  const x = placed.x + EYE.halfWidth * 1.08 * placed.scaleX;
  const y = placed.y + placed.top * placed.scaleY + 24 + sliding * SWEAT_SLIDE;
  sweat.setAttribute('transform', `translate(${x} ${y}) scale(${welling})`);
  const showing = state.sweat < 2 ? state.level.stressed * (1 - sliding * sliding) : 0;
  sweat.setAttribute('opacity', String(showing));
}

/**
 * Shake the pair while he is stressed.
 *
 * @param shaker - The group around both eyes and their props.
 * @param state - The flourish state.
 */
function writeTremble(shaker: SVGGElement, state: FlourishState): void {
  const wave = (hertz: readonly number[]) =>
    0.6 * Math.sin(2 * Math.PI * (hertz[0] ?? 0) * state.tremble) +
    0.4 * Math.sin(2 * Math.PI * (hertz[1] ?? 0) * state.tremble);
  const reach = TREMBLE.reach * state.level.stressed;
  const dx = reach * wave(TREMBLE.x);
  const dy = reach * 0.6 * wave(TREMBLE.y);
  shaker.setAttribute('transform', `translate(${dx.toFixed(2)} ${dy.toFixed(2)})`);
}

/**
 * Write one cheek's blush.
 *
 * @param blush - The blush group.
 * @param placed - Where the eye above it is drawn.
 * @param mirror - -1 for the left cheek, 1 for the right.
 * @param level - How much blush is showing.
 */
function writeBlush(blush: SVGGElement, placed: EyePlacement, mirror: number, level: number): void {
  const x = placed.x + CHEEK.outward * mirror;
  const y = placed.y + EYE.halfHeight * placed.scaleY + CHEEK.below;
  blush.setAttribute('transform', `translate(${x} ${y})`);
  blush.setAttribute('opacity', String(level));
}

/**
 * Write the tear. It wells at the outer corner of the left eye, then falls.
 *
 * @param tear - The tear's path.
 * @param placed - Where the left eye is drawn.
 * @param state - The flourish state.
 */
function writeTear(tear: SVGPathElement, placed: EyePlacement, state: FlourishState): void {
  const welling = Math.min(1, state.tear);
  const falling = Math.min(1, Math.max(0, state.tear - 1));
  const x = placed.x - EYE.halfWidth * 0.5 * placed.scaleX;
  const y = placed.y + placed.bottom * placed.scaleY + 6 + falling * falling * TEAR_FALL;
  tear.setAttribute('transform', `translate(${x} ${y}) scale(${welling * TEAR_SIZE})`);
  const showing = state.tear < 2 ? state.level.sad * (1 - falling * falling) : 0;
  tear.setAttribute('opacity', String(showing));
}

/**
 * Write one bubble, or hide its circle.
 *
 * @param circle - The circle.
 * @param bubble - The bubble, or undefined when this circle is spare.
 * @param placed - Where the right eye is drawn, which the bubbles rise from.
 * @param level - How much of the sleepy flourish is showing.
 */
function writeBubble(
  circle: SVGCircleElement,
  bubble: Bubble | undefined,
  placed: EyePlacement,
  level: number,
): void {
  if (!bubble) {
    circle.setAttribute('opacity', '0');
    return;
  }
  const wobble = Math.sin(bubble.phase + bubble.rise * 7) * 18;
  // They spread as they rise, so a stream of them fans out and does not stack.
  const x = placed.x + EYE.halfWidth * 0.9 + bubble.x * (24 + bubble.rise * 70) + wobble;
  const y = placed.y - EYE.halfHeight * 0.7 - bubble.rise * BUBBLE_RISE;
  // It swells a little as it rises, then pops: a quick swell and fade at the top.
  const pop = Math.max(0, (bubble.rise - 0.88) / 0.12);
  circle.setAttribute('cx', String(x));
  circle.setAttribute('cy', String(y));
  circle.setAttribute('r', String((7 + bubble.size * 13) * (0.6 + 0.4 * bubble.rise) * (1 + pop)));
  circle.setAttribute('opacity', String(level * Math.min(1, bubble.rise * 6) * (1 - pop)));
}

/**
 * Write one thinking dot. They climb up and outward from the right eye, each
 * one bigger than the last, the way a thought trail does in a comic.
 *
 * @param circle - The dot.
 * @param index - Which dot, 0 nearest the eye.
 * @param placed - Where the right eye is drawn.
 * @param state - The flourish state.
 */
function writeDot(
  circle: SVGCircleElement,
  index: number,
  placed: EyePlacement,
  state: FlourishState,
): void {
  const shown = Math.min(1, Math.max(0, state.dots - index));
  // A little overshoot as it lands, so it pops in and does not just fade.
  const pop = shown < 1 ? shown * (1.35 - 0.35 * shown) : 1;
  circle.setAttribute('cx', String(placed.x + EYE.halfWidth * 0.95 + index * 40));
  circle.setAttribute('cy', String(placed.y - EYE.halfHeight * 0.95 - index * 34));
  circle.setAttribute('r', String((9 + index * 5) * pop));
  circle.setAttribute('opacity', String(state.level.thinking * Math.min(1, shown * 2)));
}

/**
 * Draw one frame of flourishes.
 *
 * @param handles - The flourish elements.
 * @param rig - The eyes' own elements, for the bloom and the highlight.
 * @param state - What is showing.
 * @param pose - The pose the eyes were just drawn in.
 */
export function applyFlourishes(
  handles: FlourishHandles,
  rig: RigHandles,
  state: FlourishState,
  pose: RigParams,
): void {
  const left = eyePlacement(pose, 'left');
  const right = eyePlacement(pose, 'right');
  writeTint(handles, rig, state.level);
  writeMarks(handles, rig, 'left', left, state.level);
  writeMarks(handles, rig, 'right', right, state.level);
  writeQuestion(handles.question, right, state.level.skeptical);
  writeExclamation(handles.exclamation, left, state.level.shocked);
  writeSweat(handles.sweat, right, state);
  writeTremble(handles.shaker, state);
  writeBlush(handles.blush.left, left, -1, state.level.shy);
  writeBlush(handles.blush.right, right, 1, state.level.shy);
  writeTear(handles.tear, left, state);
  handles.bubbles.forEach((circle, index) => {
    writeBubble(circle, state.bubbles[index], right, state.level.sleepy);
  });
  handles.dots.forEach((circle, index) => {
    writeDot(circle, index, right, state);
  });
}
