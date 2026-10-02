/**
 * The small motion the eyes carry while he talks and while he listens. It
 * follows the sound itself, so it never repeats.
 *
 * It reads `voice.level` from the bus and nothing else, like everything in
 * here, so a recording replays the motion exactly. It returns offsets on top of
 * the emotion and the gesture, and the rig's springs do the smoothing.
 */
import type { SenseEventOf } from '@m8/shared';
import type { Bus, Unsubscribe } from '../bus/bus.ts';
import type { RigParams } from './rig.ts';

/** A level older than this is over. Levels arrive every 66 ms while there is sound. */
const STALE_MS = 260;

/** How far loud speech stretches his eyes taller. Squash is negative for tall. */
const TALK_STRETCH = 0.06;

/** How far loud speech lifts his lower lids, the way cheeks do when talking. */
const TALK_LOWER_LID = 0.03;

/** How far brightness makes the two eyes differ, so the motion is not symmetrical. */
const TALK_SKEW = 0.015;

/** How far the person's voice widens his pupils. */
const LISTEN_PUPIL = 0.06;

/** How far the person's voice lifts the inner ends of his brows. */
const LISTEN_BROW = 0.04;

/** How far the person's voice flattens his eyes, a small lean in. */
const LISTEN_SQUASH = 0.015;

/** The last thing heard from one voice. */
interface Heard {
  /** Loudness, 0 to 1. */
  level: number;
  /** Brightness, 0 to 1. */
  brightness: number;
  /** When it arrived, on the injected clock. */
  at: number;
}

/** The voice motion, as the controller uses it. */
export interface VoiceMotion {
  /**
   * What the voices add to this frame.
   * @returns Offsets to add to the pose, empty when nobody is making a sound.
   */
  offsets(): Partial<RigParams>;
  /** Stop listening to the bus. */
  stop(): void;
}

/**
 * What his own voice does to the eyes.
 *
 * @param heard - His voice right now.
 * @returns Eyes that stretch with loudness, a little unevenly.
 */
function talking(heard: Heard): Partial<RigParams> {
  const stretch = -heard.level * TALK_STRETCH;
  const skew = (heard.brightness - 0.5) * TALK_SKEW * heard.level;
  const lid = heard.level * TALK_LOWER_LID;
  return {
    leftSquash: stretch + skew,
    rightSquash: stretch - skew,
    leftLowerLid: lid,
    rightLowerLid: lid,
  };
}

/**
 * What the person's voice does to the eyes.
 *
 * @param heard - Their voice right now.
 * @returns Wider pupils and lifted brows, smaller and calmer than talking.
 */
function listening(heard: Heard): Partial<RigParams> {
  const pupil = heard.level * LISTEN_PUPIL;
  const brow = heard.level * LISTEN_BROW * (0.6 + 0.4 * heard.brightness);
  const squash = heard.level * LISTEN_SQUASH;
  return {
    leftPupil: pupil,
    rightPupil: pupil,
    leftBrowTilt: brow,
    rightBrowTilt: brow,
    leftSquash: squash,
    rightSquash: squash,
  };
}

/**
 * Start following the voices.
 *
 * @param bus - Where `voice.level` arrives.
 * @param now - Clock, injected for tests. Defaults to `performance.now`.
 * @returns The motion.
 */
export function createVoiceMotion(bus: Bus, now = () => performance.now()): VoiceMotion {
  const voices: Record<SenseEventOf<'voice.level'>['who'], Heard | null> = {
    self: null,
    other: null,
  };

  const off: Unsubscribe = bus.on('voice.level', (event) => {
    voices[event.who] = { level: event.level, brightness: event.brightness, at: now() };
  });

  /**
   * Read one voice, if it is still making a sound.
   * @param who - Which voice.
   * @returns What was last heard, or null once it is stale or silent.
   */
  function current(who: keyof typeof voices): Heard | null {
    const heard = voices[who];
    return heard && heard.level > 0 && now() - heard.at < STALE_MS ? heard : null;
  }

  return {
    offsets() {
      // His own voice wins. While he talks the microphone is held or is mostly
      // hearing him, and two motions at once read as a twitch.
      const self = current('self');
      if (self) return talking(self);
      const other = current('other');
      return other ? listening(other) : {};
    },
    stop: off,
  };
}
