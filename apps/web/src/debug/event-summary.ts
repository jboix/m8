/** One line per event, for the timeline. The detail a reader actually scans for. */
import type { SenseEvent, SenseEventOf, SenseEventType } from '@m8/shared';

/**
 * Format a normalised position.
 *
 * @param x - 0 to 1 across.
 * @param y - 0 to 1 down.
 * @returns The pair, to two decimals.
 */
function place(x: number, y: number): string {
  return `${x.toFixed(2)},${y.toFixed(2)}`;
}

/** How each kind of event is summarised. A new event type does not compile until it is here. */
const SUMMARIES: { [Type in SenseEventType]: (event: SenseEventOf<Type>) => string } = {
  'vision.face': (event) => `${event.id} ${place(event.x, event.y)}${event.facing ? '' : ' away'}`,
  'vision.face.lost': (event) => event.id,
  'vision.person': (event) => `${event.id} ${event.name ?? 'unknown'} ${event.score.toFixed(2)}`,
  'vision.expression': (event) => `${event.id} ${event.kind}`,
  'vision.gesture': (event) => event.kind,
  'vision.motion': (event) => `${place(event.x, event.y)} ${event.magnitude.toFixed(2)}`,
  'vision.scene': (event) => event.delta,
  'sound.class': (event) => `${event.label} ${event.confidence.toFixed(2)}`,
  'sound.loud': (event) => `${event.db.toFixed(0)} dB`,
  'voice.level': (event) =>
    `${event.who} ${event.level.toFixed(2)} bright ${event.brightness.toFixed(2)}`,
  'salience.fired': (event) =>
    `${event.outcome} ${event.voltage.toFixed(2)} ${event.causes.join(',')}`,
  presence: (event) => event.state,
  alone: (event) => event.stage,
  mood: ({ mood }) => `valence ${mood.valence.toFixed(2)} boredom ${mood.boredom.toFixed(2)}`,
};

/**
 * Describe an event in a few characters.
 *
 * @param event - The event.
 * @returns Its payload, without the type, which the timeline shows separately.
 */
export function summarise(event: SenseEvent): string {
  const summary = SUMMARIES[event.type] as (event: SenseEvent) => string;
  return summary(event);
}
