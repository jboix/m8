/**
 * Keeping the character's own voice out of its ears.
 *
 * The ambient track has echo cancellation off, so it hears the speakers at full
 * volume. Throwing away results that come back as `Speech` is not enough: a
 * synthesised voice through a phone speaker comes back as all sorts of things,
 * music among them. So the windows never reach the classifier at all.
 */
import { AMBIENT_RATE, AMBIENT_WINDOW } from './windows.ts';

/** How long a window covers, in milliseconds. */
const WINDOW_MS = (AMBIENT_WINDOW / AMBIENT_RATE) * 1000;

/**
 * How long after the character stops talking its ears stay shut.
 *
 * The tail of a sentence is still in the room after the audio element has gone
 * quiet, and a room with any reverb holds it a little longer.
 */
const HANGOVER_MS = 700;

/**
 * Whether a window overlaps the character's own voice.
 *
 * @param spokeAt - The last moment it was observed talking.
 * @param windowTs - When the window ended.
 * @returns True when any part of the window, or its hangover, is the character
 * hearing itself. A window that merely straddles the moment it started counts:
 * the classifier scores the whole second at once, and half a second of a
 * synthesised voice is enough to come back as something.
 */
export function overlapsSpeech(spokeAt: number, windowTs: number): boolean {
  return spokeAt >= windowTs - WINDOW_MS - HANGOVER_MS;
}
