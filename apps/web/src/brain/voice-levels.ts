/**
 * Puts how the two voices sound onto the bus, as `voice.level`. The
 * eyes move with it, and they read the bus and nothing else.
 *
 * His voice is measured at the speaker. The person's is measured from the
 * microphone frames on their way up the socket.
 */
import type { Bus } from '../bus/bus.ts';
import { measureSound, type SoundShape } from '../voice/level.ts';
import type { Voice } from '../voice/player.ts';

/** How often a level is published. Roughly the camera's rate, and enough for a spring. */
const LEVEL_MS = 66;

/** The running publisher. */
export interface VoiceLevels {
  /**
   * A microphone frame on its way to the model.
   * @param pcm - PCM16, exactly as it is sent. Silence when the microphone is held.
   */
  heard(pcm: ArrayBuffer): void;
  /** Stop publishing. */
  stop(): void;
}

/**
 * Start publishing voice levels.
 *
 * @param bus - Where they go.
 * @param voice - His voice, read at call time because it starts later.
 * @param now - Clock, injected for tests. Defaults to `performance.now`.
 * @returns The publisher.
 */
export function startVoiceLevels(
  bus: Bus,
  voice: () => Voice | null,
  now = () => performance.now(),
): VoiceLevels {
  let otherAt = Number.NEGATIVE_INFINITY;
  const sounding = { self: false, other: false };

  /**
   * Publish one level, and one last zero when a voice goes quiet.
   * @param who - Whose voice.
   * @param shape - How it sounds.
   */
  function publish(who: 'self' | 'other', shape: SoundShape): void {
    if (shape.level === 0 && !sounding[who]) return;
    sounding[who] = shape.level > 0;
    bus.publish({ type: 'voice.level', ts: now(), who, ...shape });
  }

  const timer = setInterval(() => {
    const playing = voice();
    publish('self', playing?.speaking() ? playing.shape() : { level: 0, brightness: 0 });
  }, LEVEL_MS);

  return {
    heard(pcm) {
      const at = now();
      if (at - otherAt < LEVEL_MS) return;
      otherAt = at;
      publish('other', measureSound(new Int16Array(pcm), 32768));
    },
    stop() {
      clearInterval(timer);
    },
  };
}
