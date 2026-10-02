/**
 * Shows that he is listening. The model takes a moment to answer, and until it
 * does nothing on screen says the words were heard. He does the one thing a
 * listener does without thinking: look at whoever is talking. The rest of the
 * listening is the voice motion in the eyes, which is quieter than a gesture.
 */
import type { EyesControls } from '../eyes/index.ts';

/** A gap this long between fragments means a new utterance has started. */
const NEW_UTTERANCE_MS = 3000;

/** How long he keeps looking at the person once they start. */
const LOOK_MS = 4000;

/** The listening behaviour, driven by the session's own events. */
export interface Attention {
  /** A fragment of the person's speech arrived. */
  heard(): void;
}

/**
 * Start the listening behaviour.
 *
 * @param controls - The eyes.
 * @param now - Clock, injected for tests. Defaults to `performance.now`.
 * @returns The behaviour.
 */
export function createAttention(controls: EyesControls, now = () => performance.now()): Attention {
  let heardAt = Number.NEGATIVE_INFINITY;

  return {
    heard() {
      const at = now();
      if (at - heardAt > NEW_UTTERANCE_MS) controls.lookAt('speaker', LOOK_MS);
      heardAt = at;
    },
  };
}
