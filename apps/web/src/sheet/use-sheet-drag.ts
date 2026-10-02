/**
 * The pull-down on a bottom sheet. A finger on the header drags the sheet with
 * it, and letting go far enough down, or with a flick, closes it. Otherwise it
 * springs back. Beside the stage, and with a mouse, it does nothing.
 */
import { type PointerEvent, type RefObject, useRef } from 'react';

/** How far down a finger has to leave the sheet, in pixels, for it to close. */
const SWIPE_PX = 80;

/** How fast a finger has to be moving down at release, in pixels per millisecond, to close it. */
const FLICK_PX_PER_MS = 0.4;

/** How long the sheet takes to leave or to spring back, in milliseconds. */
const SETTLE_MS = 200;

/** When the sheet is a bottom sheet. The same number as the phone query in sheet.css. */
const PHONE_QUERY = '(width <= 40rem)';

/** Where the finger was, and when. */
interface Sample {
  /** Its y. */
  y: number;
  /** The event's timestamp, in milliseconds. */
  at: number;
}

/** A drag in progress. */
interface Drag {
  /** Where it started. */
  start: Sample;
  /** The move before the last one, for the speed at release. */
  before: Sample;
  /** The last move seen. */
  last: Sample;
}

/** The handlers the header takes. */
type DragHandlers = Record<
  'onPointerDown' | 'onPointerMove' | 'onPointerUp' | 'onPointerCancel',
  (event: PointerEvent<HTMLElement>) => void
>;

/** What the sheet gets back. */
export interface SheetDrag {
  /** Goes on the sheet, which the finger moves. */
  sheet: RefObject<HTMLElement | null>;
  /** Go on the header. */
  handlers: DragHandlers;
}

/**
 * Whether a released finger closes the sheet.
 *
 * @param dy - How far down it travelled, in pixels.
 * @param speed - How fast it was moving down at the end, in pixels per millisecond.
 * @returns True for a pull far enough, or a flick.
 */
export function pullCloses(dy: number, speed: number): boolean {
  return dy > SWIPE_PX || (dy > 0 && speed > FLICK_PX_PER_MS);
}

/**
 * Where the finger is, from the event.
 *
 * @param event - A pointer event.
 * @returns The sample.
 */
function sampleOf(event: PointerEvent<HTMLElement>): Sample {
  return { y: event.clientY, at: event.timeStamp };
}

/**
 * How fast the finger was moving at the end.
 *
 * @remarks
 * From the last two moves, not from the last move to the release: the finger
 * lifts from where it last was, so the release adds no distance.
 *
 * @param drag - The drag.
 * @returns Pixels per millisecond, positive downward.
 */
function speedAt(drag: Drag): number {
  const ms = drag.last.at - drag.before.at;
  return ms > 0 ? (drag.last.y - drag.before.y) / ms : 0;
}

/**
 * Let go of the sheet: it slides out of view, or springs back into place.
 *
 * @param sheet - The sheet.
 * @param closes - Whether it is leaving.
 */
function settle(sheet: HTMLElement, closes: boolean): void {
  sheet.style.transition = `transform ${SETTLE_MS}ms ease-out`;
  sheet.style.transform = closes ? 'translateY(100%)' : '';
}

/**
 * Drive a sheet by touch.
 *
 * @remarks
 * The sheet moves by a transform, never by its size, so the stage behind it is
 * not laid out again on every move and the sheet keeps up with the finger. A
 * touch pointer captures to the element under the finger, so the events reach
 * the header by bubbling wherever the finger goes, and a tap on a tab is still
 * a click on it.
 *
 * @param onClose - Closes the sheet.
 * @returns The ref and the handlers.
 */
export function useSheetDrag(onClose: () => void): SheetDrag {
  const sheet = useRef<HTMLElement | null>(null);
  const drag = useRef<Drag | null>(null);

  const onPointerDown = (event: PointerEvent<HTMLElement>) => {
    if (event.pointerType !== 'touch' || !sheet.current) return;
    if (!window.matchMedia(PHONE_QUERY).matches) return;
    const start = sampleOf(event);
    drag.current = { start, before: start, last: start };
    sheet.current.style.transition = 'none';
  };

  const onPointerMove = (event: PointerEvent<HTMLElement>) => {
    if (!drag.current || !sheet.current) return;
    const now = sampleOf(event);
    drag.current.before = drag.current.last;
    drag.current.last = now;
    const dy = Math.max(0, now.y - drag.current.start.y);
    sheet.current.style.transform = `translateY(${dy}px)`;
  };

  const onPointerUp = (event: PointerEvent<HTMLElement>) => {
    if (!drag.current || !sheet.current) return;
    const closes = pullCloses(event.clientY - drag.current.start.y, speedAt(drag.current));
    drag.current = null;
    settle(sheet.current, closes);
    if (closes) setTimeout(onClose, SETTLE_MS);
  };

  return {
    sheet,
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp },
  };
}
