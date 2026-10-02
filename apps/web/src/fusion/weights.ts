/**
 * What each thing the character notices is worth, and what to call it.
 *
 * The key is what habituation is counted against, so it carries the detail that
 * makes two of the same kind different: a dog barking habituates separately
 * from a door closing, and a wave separately from a thumbs up. The weight is
 * before habituation, and is the thing to argue with when it reacts to too much
 * or too little.
 */
import type { SenseEvent } from '@m8/shared';

/** What one event is worth to the filter. */
export interface Stimulus {
  /** What habituation counts against. */
  key: string;
  /** How much charge it adds, before habituation. */
  weight: number;
}

/**
 * What an event is worth.
 *
 * @param event - What happened.
 * @returns Its key and weight, or `null` for the things that are not
 * themselves interesting: a face being where it already was, and the filter's
 * own output.
 */
export function weigh(event: SenseEvent): Stimulus | null {
  switch (event.type) {
    case 'vision.gesture':
      // A wave is somebody trying to get its attention, which is the strongest
      // thing tier 1 can report.
      return { key: `vision.gesture:${event.kind}`, weight: event.kind === 'wave' ? 1.3 : 0.7 };
    case 'vision.expression':
      return {
        key: `vision.expression:${event.kind}`,
        weight: event.kind === 'talking' ? 0.2 : 0.5,
      };
    case 'presence':
      // Someone arriving is worth reacting to. Someone leaving is worth
      // noticing, but there is nobody left to say it to.
      return { key: `presence:${event.state}`, weight: event.state === 'present' ? 1.4 : 0.3 };
    case 'vision.motion':
      return { key: 'vision.motion', weight: event.magnitude * 0.5 };
    case 'sound.class':
      // Only onsets reach the bus, so this is a sound that was not there a
      // moment ago. Worth about as much as a wave, scaled by how sure the
      // classifier was, which is the closest thing to "did I really hear that".
      return { key: `sound.class:${event.label}`, weight: 0.5 + event.confidence * 0.7 };
    case 'sound.loud':
      // A bang is the one thing that gets a reaction with no idea what it was.
      return { key: 'sound.loud', weight: 1.2 };
    case 'vision.scene':
      return { key: 'vision.scene', weight: 0.6 };
    case 'vision.face':
    case 'vision.face.lost':
    // Who somebody is reaches the model by its own channel, not by boredom.
    case 'vision.person':
    case 'salience.fired':
    // Being left alone is handled by `missing.ts`, which asks where they went.
    case 'alone':
    // His own mood is not news to him.
    case 'mood':
    // A conversation is not something to get bored out of. The floor handles it.
    case 'voice.level':
      return null;
  }
}
