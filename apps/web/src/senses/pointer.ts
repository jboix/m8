/**
 * The mouse, pretending to be a camera. It publishes `vision.face` events at
 * the pointer, so the gaze arbiter is driven by exactly the events the face
 * landmarker sends, and a session recorded with a mouse replays
 * as though someone had been sitting there.
 */
import type { Bus } from '../bus/bus.ts';

/** Fastest the pointer reports, in events per second. Roughly camera rate. */
const RATE_HZ = 15;

/** The id every pointer face carries. A camera will use a real track id. */
const FACE_ID = 'pointer';

/** A point in the window, each axis 0 to 1. */
export interface ViewPoint {
  /** Across, from the left edge. */
  x: number;
  /** Down, from the top edge. */
  y: number;
}

/** The middle of the window, which is where the eyes are unless somebody says otherwise. */
const MIDDLE: ViewPoint = { x: 0.5, y: 0.5 };

/**
 * Where the pointer is, as the eyes see it.
 *
 * @param pointer - The pointer's position on one axis, 0 to 1 across the window.
 * @param eyes - The eyes' position on the same axis.
 * @returns The position with the eyes taken as the middle, held inside 0 to 1.
 * A pointer resting on the eyes is straight ahead wherever the eyes are drawn.
 */
function seenFrom(pointer: number, eyes: number): number {
  return Math.min(1, Math.max(0, 0.5 + pointer - eyes));
}

/** A running pointer sense. */
export interface PointerSense {
  /** Stop listening and stop publishing. */
  stop(): void;
}

/**
 * Publish the pointer's position as a face.
 *
 * @param view - The window to listen on and measure against.
 * @param bus - Where the events go.
 * @param now - Clock, injected for tests. Defaults to `performance.now`.
 * @param eyes - Where the eyes are drawn in the window, asked on every event
 * because the setup screen moves them. Defaults to the middle.
 * @returns The running sense.
 */
export function startPointerSense(
  view: Window,
  bus: Bus,
  now = () => performance.now(),
  eyes: () => ViewPoint = () => MIDDLE,
): PointerSense {
  let seen = false;
  let sentAt = 0;

  const onPointerMove = (event: PointerEvent) => {
    const at = now();
    seen = true;
    if (at - sentAt < 1000 / RATE_HZ) return;
    sentAt = at;
    bus.publish({
      type: 'vision.face',
      ts: at,
      id: FACE_ID,
      x: seenFrom(event.clientX / view.innerWidth, eyes().x),
      y: seenFrom(event.clientY / view.innerHeight, eyes().y),
      size: 0.3,
      facing: true,
    });
  };

  view.addEventListener('pointermove', onPointerMove, { passive: true });

  return {
    stop() {
      view.removeEventListener('pointermove', onPointerMove);
      if (seen) bus.publish({ type: 'vision.face.lost', ts: now(), id: FACE_ID });
    },
  };
}
