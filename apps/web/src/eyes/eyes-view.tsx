/**
 * The SVG the character is drawn with. React renders this once and then never
 * touches it again: every frame after the first is written by
 * {@link applyRig} through the handles collected here.
 */
import { useEffect, useState } from 'react';
import {
  EyeMarks,
  FlourishDefs,
  FlourishProps,
  type PartialFlourishHandles,
} from './flourish-view.tsx';
import { EYE, stageViewBox } from './geometry.ts';
import type { EyeHandles } from './rig-writer.ts';

/** Identifier of the blur that turns a copy of each eye into its bloom. */
const BLOOM_ID = 'm8-bloom';

/** The eye's gradient at rest, top to bottom. The tint flourish recolours the stops. */
const GRADIENT = [
  ['0%', '#a8f4ff'],
  ['45%', '#38cdff'],
  ['100%', '#0a7fdc'],
] as const;

/** What the definitions need. */
interface DefsProps {
  /** Where the gradient's stops and the clip paths report their elements. */
  flourishes: PartialFlourishHandles;
}

/**
 * Gradients, the bloom filter and the clip paths, defined once and used by both eyes.
 *
 * @param props - Where to report the elements the flourishes recolour.
 * @returns The definitions.
 */
function Defs({ flourishes }: DefsProps) {
  return (
    <defs>
      <linearGradient id="m8-eye" x1="0" y1="0" x2="0" y2="1">
        {GRADIENT.map(([offset, colour], index) => (
          <stop
            key={offset}
            offset={offset}
            stopColor={colour}
            ref={(element) => {
              if (element) flourishes.stops[index] = element;
            }}
          />
        ))}
      </linearGradient>
      <filter id={BLOOM_ID} x="-60%" y="-60%" width="220%" height="220%">
        <feGaussianBlur stdDeviation="21" />
      </filter>
      <FlourishDefs handles={flourishes} />
    </defs>
  );
}

/** The six moving parts of one eye, collected as the SVG mounts. */
export type PartialEyeHandles = Partial<EyeHandles>;

/** Both eyes, while they are still filling in. */
export type PartialRigHandles = Partial<Record<'left' | 'right', PartialEyeHandles>>;

/** What one eye needs to draw itself and report its parts. */
interface EyeProps {
  /** Which eye. */
  side: 'left' | 'right';
  /** Where the marks inside it report their elements. */
  flourishes: PartialFlourishHandles;
  /** The object each part writes itself into as it mounts. */
  parts: PartialEyeHandles;
}

/**
 * One eye: a bloom, the lit shape, and the highlight riding its top edge.
 *
 * @param props - Where to report the eye's parts.
 * @returns The eye's group.
 */
function Eye({ parts, side, flourishes }: EyeProps) {
  return (
    <g
      ref={(element) => {
        if (element) parts.group = element;
      }}
    >
      <path
        className="m8-glow"
        filter={`url(#${BLOOM_ID})`}
        ref={(element) => {
          if (element) parts.glow = element;
        }}
      />
      <path
        className="m8-eye"
        ref={(element) => {
          if (element) parts.shape = element;
        }}
      />
      <rect
        className="m8-highlight"
        x={-EYE.halfWidth * 0.46}
        width={EYE.halfWidth * 0.5}
        height={11}
        rx={5.5}
        ref={(element) => {
          if (element) parts.highlight = element;
        }}
      />
      <EyeMarks handles={flourishes} side={side} />
    </g>
  );
}

/**
 * Track the stage's own box and give back a viewBox fitted to it.
 *
 * @remarks
 * It watches the element rather than the window because the debug panel is a
 * grid cell, not an overlay: opening it makes the stage narrower, and the
 * character has to refit into what is left instead of hiding behind it. This
 * runs on resize, not per frame. The rig's loop never touches React.
 *
 * @param element - The stage, once it has mounted.
 * @returns The current viewBox.
 */
function useStageViewBox(element: SVGSVGElement | null): string {
  const [viewBox, setViewBox] = useState(() => stageViewBox(window.innerWidth, window.innerHeight));

  useEffect(() => {
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      const box = entry?.contentRect;
      if (box) setViewBox(stageViewBox(box.width, box.height));
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, [element]);

  return viewBox;
}

/** What the stage needs to draw the pair. */
interface EyesViewProps {
  /** Filled in as the elements mount, then read once by the controller. */
  handles: PartialRigHandles;
  /** The flourish elements, filled in the same way. */
  flourishes: PartialFlourishHandles;
}

/**
 * The pair of eyes, filling the viewport.
 *
 * @param props - Where to report the animated elements.
 * @returns The stage.
 */
export function EyesView({ handles, flourishes }: EyesViewProps) {
  handles.left ??= {};
  handles.right ??= {};
  const [stage, setStage] = useState<SVGSVGElement | null>(null);
  const viewBox = useStageViewBox(stage);

  return (
    <svg
      className="m8-stage"
      ref={setStage}
      viewBox={viewBox}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="A pair of robot eyes"
    >
      <Defs flourishes={flourishes} />
      <g transform="translate(500 330)">
        {/* Everything the trembling moves: both eyes and their props. */}
        <g
          ref={(element) => {
            if (element) flourishes.shaker = element;
          }}
        >
          <Eye parts={handles.left} side="left" flourishes={flourishes} />
          <Eye parts={handles.right} side="right" flourishes={flourishes} />
          <FlourishProps handles={flourishes} bloom={BLOOM_ID} />
        </g>
      </g>
    </svg>
  );
}
