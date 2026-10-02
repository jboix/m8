/** Whether the debug panel is open. The button over the stage opens it, and its own close button shuts it. */
import { useCallback, useState } from 'react';

/** An open/closed flag and the one way to flip it. */
export interface DebugToggle {
  /** Whether the panel is showing. */
  shown: boolean;
  /** Flip it. Safe to pass straight to an onClick. */
  toggle: () => void;
}

/**
 * Track the panel's visibility.
 *
 * @returns The flag and its toggle.
 */
export function useDebugToggle(): DebugToggle {
  const [shown, setShown] = useState(false);
  const toggle = useCallback(() => {
    setShown((current) => !current);
  }, []);
  return { shown, toggle };
}
