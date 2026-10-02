/**
 * Where the rig is docked and how big it is: beside the stage or under it, the
 * way DevTools docks. Pure, so the sizes and their limits are tested without a
 * browser. The browser keeps the choice between visits.
 */

/** Where the rig sits. */
export type Dock = 'side' | 'bottom';

/** The rig's place and its size on each side, in CSS pixels. Null is the default size. */
export interface RigLayout {
  /** Where it sits now. */
  dock: Dock;
  /** Its width when beside the stage. */
  side: number | null;
  /** Its height when under the stage. */
  bottom: number | null;
}

/** A window's inner size. */
export interface Viewport {
  /** Its width. */
  width: number;
  /** Its height. */
  height: number;
}

/** The layout before anybody has moved anything: beside the stage, at the default width. */
export const DEFAULT_RIG_LAYOUT: RigLayout = { dock: 'side', side: null, bottom: null };

/** The storage key. Versioned, so a change of shape can ignore what came before. */
const KEY = 'm8.rig-layout.v1';

/** The smallest the rig gets, so its tabs and toolbars still fit. */
const MIN_SIZE: Record<Dock, number> = { side: 300, bottom: 160 };

/** The least the stage keeps beside or above the rig, so the eyes stay in view. */
const MIN_STAGE: Record<Dock, number> = { side: 240, bottom: 140 };

/** How far one arrow key moves the bar. */
export const KEY_STEP = 16;

/**
 * Keep a size inside its limits.
 *
 * @param dock - Which side it is for.
 * @param size - The size asked for.
 * @param viewport - The window.
 * @returns The size, no smaller than the rig needs and no larger than leaves
 * the stage its share. When the window is too small for both, the rig gets its
 * minimum.
 */
export function clampSize(dock: Dock, size: number, viewport: Viewport): number {
  const room = dock === 'side' ? viewport.width : viewport.height;
  const largest = Math.max(MIN_SIZE[dock], room - MIN_STAGE[dock]);
  return Math.round(Math.min(largest, Math.max(MIN_SIZE[dock], size)));
}

/**
 * The size a drag asks for: the distance from the pointer to the far edge.
 *
 * @param dock - Which side the rig is on.
 * @param pointer - Where the pointer is.
 * @param pointer.x - Its distance from the left edge.
 * @param pointer.y - Its distance from the top edge.
 * @param viewport - The window.
 * @returns The size, kept inside its limits.
 */
export function sizeAt(dock: Dock, pointer: { x: number; y: number }, viewport: Viewport): number {
  const size = dock === 'side' ? viewport.width - pointer.x : viewport.height - pointer.y;
  return clampSize(dock, size, viewport);
}

/**
 * Whether a stored value is a size.
 *
 * @param value - What was stored.
 * @returns True for a positive finite number.
 */
function isSize(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

/**
 * Read the stored layout.
 *
 * @param storage - Where it was kept.
 * @returns The layout, or the default when there is none, it does not read, or
 * storage is refused.
 */
export function loadRigLayout(storage: Storage): RigLayout {
  try {
    const raw: unknown = JSON.parse(storage.getItem(KEY) ?? 'null');
    if (typeof raw !== 'object' || raw === null) return DEFAULT_RIG_LAYOUT;
    const { dock, side, bottom } = raw as Record<string, unknown>;
    return {
      dock: dock === 'bottom' ? 'bottom' : 'side',
      side: isSize(side) ? side : null,
      bottom: isSize(bottom) ? bottom : null,
    };
  } catch {
    return DEFAULT_RIG_LAYOUT;
  }
}

/**
 * Keep the layout for the next visit.
 *
 * @param storage - Where to keep it.
 * @param layout - What to keep.
 */
export function saveRigLayout(storage: Storage, layout: RigLayout): void {
  try {
    storage.setItem(KEY, JSON.stringify(layout));
  } catch {
    // Refused: the layout lasts for this visit only.
  }
}
