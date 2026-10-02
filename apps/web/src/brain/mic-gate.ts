/**
 * Whether a frame of microphone audio goes to the model or is replaced with
 * silence. Silence rather than nothing: dropping frames cuts a word in half,
 * and a continuous stream of quiet is something the model knows what to do with.
 */
import type { Listening } from '@m8/shared';

/**
 * How much of its own voice the echo canceller has to hear before the
 * microphone is opened during speech.
 *
 * @remarks
 * Playing through a media element puts the character's voice where the
 * canceller can subtract it, but it still has to converge. Until it has, the
 * only thing the microphone would pick up is the character itself, and the
 * model's voice activity detector reads that as someone talking over it: it
 * interrupts itself, every time.
 *
 * Measured in speaker-active time rather than wall clock, because a session
 * that has been silent for a minute has taught the canceller nothing. After
 * this the call is full duplex and talking over it interrupts it, which is the
 * whole point of not simply muting the microphone while it speaks.
 */
export const ECHO_WARMUP_MS = 2500;

/** What the gate needs to know about the character's voice. */
export interface VoiceState {
  /** Whether his voice is playing right now. */
  speaking(): boolean;
  /** How long his voice has played in total, in milliseconds. */
  spokenMs(): number;
}

/** What the gate decides from. */
export interface GateInputs {
  /** Who marks the turns. */
  listening: Listening;
  /** True while the person holds the talk button. Read only for `button`. */
  talking: boolean;
  /** The character's voice, or null before it has started. */
  voice: VoiceState | null;
  /** True holds the microphone for the whole of every utterance of his. */
  halfDuplex: boolean;
}

/**
 * Whether this frame of microphone audio should be replaced with silence.
 *
 * @param inputs - Who marks the turns, the button, his voice and the duplex setting.
 * @returns True when the frame must not reach the model. With the button
 * marking the turns, that is whenever it is not held: the button is the whole
 * gate, and the echo warm-up is not needed because the model's own detector
 * is off. Otherwise it is while the character is speaking and either the
 * canceller has not yet had {@link ECHO_WARMUP_MS} of its voice to learn from,
 * or the caller has given up on it ever converging.
 */
export function heldFrame({ listening, talking, voice, halfDuplex }: GateInputs): boolean {
  if (listening === 'button') return !talking;
  if (!voice?.speaking()) return false;
  return halfDuplex || voice.spokenMs() < ECHO_WARMUP_MS;
}
