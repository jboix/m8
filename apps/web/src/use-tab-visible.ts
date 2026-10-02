/**
 * Whether anybody can see the tab.
 *
 * A hidden tab still holds the camera, the microphone and a live session that
 * bills by the minute, for a face nobody is looking at. When the tab is hidden
 * the senses pause and the session closes.
 */
import { useEffect, useState } from 'react';

/**
 * How long the tab has to stay hidden before it counts.
 *
 * @remarks
 * Glancing at another tab should not cost a reconnect and a new session.
 * Leaving for another window should.
 */
const HIDDEN_GRACE_MS = 15_000;

/**
 * Watch the tab's visibility.
 *
 * @returns False once the tab has been hidden for a while, and true again the
 * moment it is shown.
 */
export function useTabVisible(): boolean {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    let hiding: ReturnType<typeof setTimeout> | undefined;
    const onChange = () => {
      clearTimeout(hiding);
      if (document.visibilityState === 'visible') {
        setVisible(true);
        return;
      }
      hiding = setTimeout(() => {
        setVisible(false);
      }, HIDDEN_GRACE_MS);
    };
    document.addEventListener('visibilitychange', onChange);
    return () => {
      clearTimeout(hiding);
      document.removeEventListener('visibilitychange', onChange);
    };
  }, []);

  return visible;
}
