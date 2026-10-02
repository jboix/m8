/**
 * The elements the flourishes are drawn with.  They are all here at
 * rest and invisible; `flourish-writer.ts` moves and shows them each frame, so
 * nothing mounts or unmounts while the character is running.
 */
import type { FlourishHandles } from './flourish-writer.ts';
import { MAX_BUBBLES, THINKING_DOTS } from './flourishes.ts';

/** The flourish elements, filled in as they mount. */
export interface PartialFlourishHandles {
  /** The gradient's stops, by position. */
  stops: SVGStopElement[];
  /** Each eye's clip path. */
  clips: Partial<FlourishHandles['clips']>;
  /** Each eye's star. */
  stars: Partial<FlourishHandles['stars']>;
  /** Each eye's pair of tiny stars. */
  twinkles: Partial<FlourishHandles['twinkles']>;
  /** The question mark. */
  question?: SVGGElement;
  /** Each cheek's blush. */
  blush: Partial<FlourishHandles['blush']>;
  /** The tear. */
  tear?: SVGPathElement;
  /** The bubbles, by index. */
  bubbles: SVGCircleElement[];
  /** The thinking dots, by index. */
  dots: SVGCircleElement[];
  /** The exclamation mark. */
  exclamation?: SVGGElement;
  /** The sweat drop. */
  sweat?: SVGPathElement;
  /** The group that trembles. */
  shaker?: SVGGElement;
}

/**
 * An empty set of handles, for the view to fill in.
 *
 * @returns Handles with nothing mounted yet.
 */
export function emptyFlourishHandles(): PartialFlourishHandles {
  return { stops: [], clips: {}, stars: {}, twinkles: {}, blush: {}, bubbles: [], dots: [] };
}

/**
 * Check that every flourish element has mounted.
 *
 * @param handles - What the view has filled in so far.
 * @returns The complete handles, or null while anything is missing.
 */
export function completeFlourishHandles(handles: PartialFlourishHandles): FlourishHandles | null {
  const { clips, stars, twinkles, blush, question, tear, exclamation, sweat, shaker } = handles;
  const elements = [
    ...[clips.left, clips.right, stars.left, stars.right],
    ...[twinkles.left, twinkles.right, blush.left, blush.right],
    ...[question, tear, exclamation, sweat, shaker],
  ];
  const counted =
    handles.stops.length === 3 &&
    handles.bubbles.length === MAX_BUBBLES &&
    handles.dots.length === THINKING_DOTS;
  if (!counted || elements.some((element) => !element)) return null;
  return handles as FlourishHandles;
}

/** The id of one eye's clip path. */
const CLIP_ID = { left: 'm8-clip-left', right: 'm8-clip-right' } as const;

/**
 * A five pointed star around the origin.
 *
 * @param outer - The radius of the points.
 * @param inner - The radius of the notches.
 * @returns The polygon's points.
 */
function starPoints(outer: number, inner: number): string {
  return Array.from({ length: 10 }, (_, index) => {
    const radius = index % 2 === 0 ? outer : inner;
    const angle = (Math.PI / 5) * index - Math.PI / 2;
    return `${(Math.cos(angle) * radius).toFixed(1)},${(Math.sin(angle) * radius).toFixed(1)}`;
  }).join(' ');
}

/** The star's outline, worked out once. */
const STAR = starPoints(34, 14);

/** What the clip paths need. */
interface FlourishDefsProps {
  /** Where to report the clip paths. */
  handles: PartialFlourishHandles;
}

/**
 * The clip path of each eye. The writer keeps them on the eyes' outlines.
 *
 * @param props - Where to report the elements.
 * @returns Two clip paths, for inside `<defs>`.
 */
export function FlourishDefs({ handles }: FlourishDefsProps) {
  return (
    <>
      {(['left', 'right'] as const).map((side) => (
        <clipPath id={CLIP_ID[side]} key={side}>
          <path
            ref={(element) => {
              if (element) handles.clips[side] = element;
            }}
          />
        </clipPath>
      ))}
    </>
  );
}

/** What the marks of one eye need. */
interface EyeMarksProps {
  /** Where to report the elements. */
  handles: PartialFlourishHandles;
  /** Which eye these are inside. */
  side: 'left' | 'right';
}

/**
 * The marks inside one eye, clipped to its outline. They sit inside the eye's
 * own group, so they ride the lids, the gaze and the squash for free.
 *
 * @param props - Which eye, and where to report the elements.
 * @returns The star and the tiny stars. Both are glares: drawn in the
 * highlight's colour, where the highlight is.
 */
export function EyeMarks({ handles, side }: EyeMarksProps) {
  return (
    <g clipPath={`url(#${CLIP_ID[side]})`}>
      <polygon
        className="m8-star"
        points={STAR}
        opacity={0}
        ref={(element) => {
          if (element) handles.stars[side] = element;
        }}
      />
      <g
        className="m8-star"
        opacity={0}
        ref={(element) => {
          if (element) handles.twinkles[side] = element;
        }}
      >
        <polygon points={STAR} transform="scale(0.5)" />
        <polygon points={STAR} transform="translate(34 24) scale(0.28)" />
      </g>
    </g>
  );
}

/** What one cheek needs. */
interface BlushProps {
  /** Where to report the element. */
  handles: PartialFlourishHandles;
  /** Which cheek. */
  side: 'left' | 'right';
  /** The id of the blur the glow behind the marks uses. */
  bloom: string;
}

/**
 * One cheek's blush: a soft glow, and three hatch marks over it.
 *
 * @param props - Which cheek, and where to report it.
 * @returns The group, invisible until he is shy.
 */
function Blush({ handles, side, bloom }: BlushProps) {
  return (
    <g
      className="m8-blush"
      opacity={0}
      ref={(element) => {
        if (element) handles.blush[side] = element;
      }}
    >
      <ellipse rx={50} ry={20} filter={`url(#${bloom})`} />
      <path d="M -26 11 L -14 -11 M -6 11 L 6 -11 M 14 11 L 26 -11" />
    </g>
  );
}

/** What a run of circles needs. */
interface CirclesProps {
  /** The class every circle gets. */
  className: string;
  /** Where each circle reports itself, by index. */
  into: SVGCircleElement[];
  /** How many there are. */
  count: number;
}

/**
 * A fixed run of circles, all invisible until the writer places them.
 *
 * @param props - How many, their class, and where they report.
 * @returns The circles.
 */
function Circles({ className, into, count }: CirclesProps) {
  return (
    <>
      {Array.from({ length: count }, (_, index) => index).map((index) => (
        <circle
          className={className}
          key={index}
          opacity={0}
          ref={(element) => {
            if (element) into[index] = element;
          }}
        />
      ))}
    </>
  );
}

/** What the props need. */
interface FlourishPropsProps {
  /** Where to report the elements. */
  handles: PartialFlourishHandles;
  /** The id of the blur the blush glows with. */
  bloom: string;
}

/** The outline of a drop, point up, shared by the tear and the sweat. */
const DROP = 'M 0 -24 C 12 -5 17 5 17 12 A 17 17 0 1 1 -17 12 C -17 5 -12 -5 0 -24 Z';

/**
 * The props, drawn beside the eyes: the blush, the question mark, the
 * exclamation mark, the tear, the sweat drop, the bubbles and the thinking dots.
 *
 * @param props - Where to report the elements.
 * @returns The props, all invisible at rest.
 */
export function FlourishProps({ handles, bloom }: FlourishPropsProps) {
  return (
    <g>
      <Blush handles={handles} side="left" bloom={bloom} />
      <Blush handles={handles} side="right" bloom={bloom} />
      <g
        className="m8-question"
        opacity={0}
        ref={(element) => {
          if (element) handles.question = element;
        }}
      >
        <path d="M -19 -18 C -19 -46 19 -46 19 -18 C 19 0 0 0 0 17" />
        <circle cx={0} cy={38} r={7.5} />
      </g>
      <g
        className="m8-exclamation"
        opacity={0}
        ref={(element) => {
          if (element) handles.exclamation = element;
        }}
      >
        <path d="M -12 -62 L 12 -62 L 6 14 L -6 14 Z" />
        <circle cx={0} cy={38} r={10} />
      </g>
      <path
        className="m8-tear"
        d={DROP}
        opacity={0}
        ref={(element) => {
          if (element) handles.tear = element;
        }}
      />
      <path
        className="m8-sweat"
        d={DROP}
        opacity={0}
        ref={(element) => {
          if (element) handles.sweat = element;
        }}
      />
      <Circles className="m8-bubble" into={handles.bubbles} count={MAX_BUBBLES} />
      <Circles className="m8-dot" into={handles.dots} count={THINKING_DOTS} />
    </g>
  );
}
