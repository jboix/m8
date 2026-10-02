/**
 * The bar on the rig's inner edge that resizes it, and the button that docks
 * it beside the stage or under it, the way DevTools does both.
 */
import { type KeyboardEvent, type PointerEvent, useRef } from 'react';
import { clampSize, type Dock, KEY_STEP, sizeAt } from '../sheet/rig-layout.ts';
import type { RigLayoutControl } from '../sheet/use-rig-layout.ts';

/**
 * The window's inner size.
 *
 * @returns Its width and height.
 */
function viewport() {
  return { width: window.innerWidth, height: window.innerHeight };
}

/**
 * The rig's size on screen now, measured from the sheet the bar sits in.
 *
 * @param bar - The bar.
 * @param dock - Which side the rig is on.
 * @returns Its width beside the stage, its height under it.
 */
function measured(bar: HTMLElement, dock: Dock): number {
  const box = (bar.parentElement ?? bar).getBoundingClientRect();
  return Math.round(dock === 'side' ? box.width : box.height);
}

/**
 * How far an arrow key moves the rig's size.
 *
 * @param dock - Which side the rig is on.
 * @param key - The key.
 * @returns The change in pixels: towards the stage grows the rig. Zero for any other key.
 */
function keyChange(dock: Dock, key: string): number {
  const grow = dock === 'side' ? 'ArrowLeft' : 'ArrowUp';
  const shrink = dock === 'side' ? 'ArrowRight' : 'ArrowDown';
  if (key === grow) return KEY_STEP;
  if (key === shrink) return -KEY_STEP;
  return 0;
}

/**
 * The drag and the arrow keys that resize the rig.
 *
 * @param layout - The rig's layout.
 * @returns The bar's event handlers. A drag shows each size at once and keeps
 * the last one when the pointer lets go.
 */
function useResize(layout: RigLayoutControl) {
  const { dock, preview, commit } = layout;
  // The size the drag has reached, or null when there is no drag.
  const reached = useRef<number | null>(null);
  const finish = () => {
    if (reached.current !== null) commit(reached.current);
    reached.current = null;
    document.documentElement.removeAttribute('data-rig-resizing');
  };
  return {
    onPointerDown: (event: PointerEvent<HTMLDivElement>) => {
      event.currentTarget.setPointerCapture(event.pointerId);
      reached.current = measured(event.currentTarget, dock);
      // Stops text being selected and keeps the cursor while the pointer is off the bar.
      document.documentElement.setAttribute('data-rig-resizing', dock);
    },
    onPointerMove: (event: PointerEvent<HTMLDivElement>) => {
      if (reached.current === null) return;
      reached.current = sizeAt(dock, { x: event.clientX, y: event.clientY }, viewport());
      preview(reached.current);
    },
    onPointerUp: finish,
    onPointerCancel: finish,
    onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => {
      const change = keyChange(dock, event.key);
      if (change === 0) return;
      event.preventDefault();
      commit(clampSize(dock, measured(event.currentTarget, dock) + change, viewport()));
    },
  };
}

/**
 * The resize bar. Drag it, or focus it and use the arrow keys.
 *
 * @param props - The rig's layout.
 * @returns The bar, laid over the rig's inner edge.
 */
export function RigResizer({ layout }: { layout: RigLayoutControl }) {
  const handlers = useResize(layout);
  return (
    // biome-ignore lint/a11y/useSemanticElements: an <hr> cannot be dragged or focused; a focusable separator with a value is the ARIA window splitter.
    <div
      className="m8-rig-resizer"
      role="separator"
      tabIndex={0}
      aria-label="Resize the rig"
      aria-orientation={layout.dock === 'side' ? 'vertical' : 'horizontal'}
      aria-valuenow={layout.size ?? undefined}
      data-dock={layout.dock}
      {...handlers}
    />
  );
}

/**
 * The button that moves the rig to the other side. Its icon shows where it goes.
 *
 * @param props - The rig's layout.
 * @returns The button.
 */
export function DockButton({ layout }: { layout: RigLayoutControl }) {
  const next: Dock = layout.dock === 'side' ? 'bottom' : 'side';
  return (
    <button
      type="button"
      className="m8-dock"
      aria-label={next === 'bottom' ? 'Dock the rig to the bottom' : 'Dock the rig to the side'}
      title={next === 'bottom' ? 'Dock to bottom' : 'Dock to right'}
      onClick={() => {
        layout.setDock(next);
      }}
    >
      <svg viewBox="0 0 14 12" aria-hidden="true">
        <rect x="0.75" y="0.75" width="12.5" height="10.5" rx="1" />
        {next === 'bottom' ? (
          <rect className="m8-dock-pane" x="0.75" y="7" width="12.5" height="4.25" />
        ) : (
          <rect className="m8-dock-pane" x="8.5" y="0.75" width="4.75" height="10.5" />
        )}
      </svg>
    </button>
  );
}
