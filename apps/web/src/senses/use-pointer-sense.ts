/**
 * Runs the pointer sense, but only when there is no camera to take over from
 * it.
 *
 * The pointer stands in for a face, publishing the same `vision.face` events at
 * the same priority, so with a camera running the two compete and whichever
 * arrived last wins. That reads as the character being unable to decide what it
 * is looking at. The camera is the real sense; the mouse is what fills in for
 * it.
 */
import { type RefObject, useEffect } from 'react';
import type { Bus } from '../bus/bus.ts';
import { startPointerSense, type ViewPoint } from './pointer.ts';

/**
 * Find the middle of an element, as a fraction of the window.
 *
 * @param element - Where the eyes are drawn, or null before it has mounted.
 * @returns Its middle, or the window's when there is no element yet.
 */
function middleOf(element: HTMLElement | null): ViewPoint {
  if (!element) return { x: 0.5, y: 0.5 };
  const box = element.getBoundingClientRect();
  return {
    x: (box.left + box.width / 2) / window.innerWidth,
    y: (box.top + box.height / 2) / window.innerHeight,
  };
}

/**
 * Publish the pointer to a bus while it is wanted.
 *
 * @param bus - Where the events go.
 * @param wanted - False leaves the mouse out of it entirely.
 * @param stage - The element the eyes are drawn in. The setup screen puts it
 * at the top of the window, and the gaze has to be measured from there.
 */
export function usePointerSense(
  bus: Bus,
  wanted: boolean,
  stage: RefObject<HTMLElement | null>,
): void {
  useEffect(() => {
    if (!wanted) return;
    const sense = startPointerSense(window, bus, undefined, () => middleOf(stage.current));
    return () => {
      sense.stop();
    };
  }, [bus, wanted, stage]);
}
