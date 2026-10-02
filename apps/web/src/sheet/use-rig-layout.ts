/**
 * The rig's dock and size, held by the app because the app lays out the stage
 * and the rig side by side or one above the other.
 */
import { type CSSProperties, type RefObject, useCallback, useRef, useState } from 'react';
import { type Dock, loadRigLayout, type RigLayout, saveRigLayout } from './rig-layout.ts';

/** The CSS variable the app's grid reads the rig's size from. */
const SIZE_VARIABLE = '--rig-size';

/** What the app and the rig get. */
export interface RigLayoutControl {
  /** Where the rig sits. */
  dock: Dock;
  /** Its size on that side, or null for the default. */
  size: number | null;
  /** Goes on the app's `<main>`, so a drag can move the grid without a render. */
  main: RefObject<HTMLElement | null>;
  /** The grid's size variable, for the app's `<main>`. */
  style: CSSProperties;
  /**
   * Move the rig to the other side. Each side keeps its own size.
   * @param dock - Where to.
   */
  setDock: (dock: Dock) => void;
  /**
   * Show a size while a drag is under way, without a render.
   * @param size - The size, already inside its limits.
   */
  preview: (size: number) => void;
  /**
   * Keep a size: at the end of a drag, or on an arrow key.
   * @param size - The size, already inside its limits.
   */
  commit: (size: number) => void;
}

/**
 * Hold the rig's layout, read from the browser and kept there.
 *
 * @returns The dock, the size, and the ways to change them.
 */
export function useRigLayout(): RigLayoutControl {
  const [layout, setLayout] = useState<RigLayout>(() => loadRigLayout(localStorage));
  const main = useRef<HTMLElement | null>(null);

  const change = useCallback((next: (current: RigLayout) => RigLayout) => {
    setLayout((current) => {
      const changed = next(current);
      saveRigLayout(localStorage, changed);
      return changed;
    });
  }, []);

  const size = layout[layout.dock];
  return {
    dock: layout.dock,
    size,
    main,
    style: (size === null ? {} : { [SIZE_VARIABLE]: `${size}px` }) as CSSProperties,
    setDock: useCallback((dock: Dock) => change((current) => ({ ...current, dock })), [change]),
    preview: useCallback((next: number) => {
      main.current?.style.setProperty(SIZE_VARIABLE, `${next}px`);
    }, []),
    commit: useCallback(
      (next: number) => change((current) => ({ ...current, [current.dock]: next })),
      [change],
    ),
  };
}
