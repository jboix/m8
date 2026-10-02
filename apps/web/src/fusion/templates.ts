/**
 * Turning what caught his attention into the line that makes him speak up.
 *
 * These are `[idle]` lines, and the persona tells the model they are
 * its own boredom rather than someone speaking. The model sees and hears for
 * itself, so the line only hints at what the local senses caught. The hints are
 * written from his point of view: "someone waved at you", not "a wave gesture
 * was detected".
 */
import type { SenseEvent } from '@m8/shared';

/** The prefix that marks a line as his own boredom rather than speech. */
export const IDLE_PREFIX = '[idle]';

/**
 * The line that tells him the person he was with has gone. The persona says
 * what an `[away]` line is, and this says what to do about this one.
 */
/** The prefix of a line about who is in front of him. */
export const WHO_PREFIX = '[who]';

/**
 * The line about who is in front of him.
 *
 * @param names - Each face in view: a name, or `null` for a stranger.
 * @returns The line, or `null` when there is nothing worth saying: nobody, or
 * one stranger, which `presence` already covers.
 */
export function toWhoLine(names: (string | null)[]): string | null {
  if (names.length === 0 || (names.length === 1 && names[0] === null)) return null;
  const strangers = names.filter((name) => name === null).length;
  const known = names.filter((name): name is string => name !== null);
  const parts = [
    ...known,
    ...(strangers === 1 ? ['somebody you do not know by sight'] : []),
    ...(strangers > 1 ? [`${strangers} people you do not know by sight`] : []),
  ];
  const list =
    parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`;
  return `${WHO_PREFIX} In front of you now: ${list}.`;
}

export const AWAY_LINE =
  '[away] You cannot see anybody any more. They were here a moment ago. Ask where they went, by name, in one short line. Then wait.';

/**
 * Add the time to a line put into the session, so that he knows the hour
 * however long the session has been open.
 *
 * @param line - An `[idle]` or `[away]` line.
 * @param now - The present.
 * @returns The line, ending with the time on a 24 hour clock.
 */
export function withClock(line: string, now: Date): string {
  const time = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return `${line} It is ${time}.`;
}

/**
 * Describe one event.
 *
 * @param event - What happened.
 * @returns The clause, or `null` for the ones with nothing worth saying.
 */
function describe(event: SenseEvent): string | null {
  switch (event.type) {
    case 'vision.gesture':
      return event.kind === 'wave'
        ? 'someone waved at you'
        : `someone made a ${event.kind} gesture`;
    case 'vision.expression':
      return `the person in front of you is ${event.kind === 'talking' ? 'talking' : `looking ${event.kind}`}`;
    case 'presence':
      return event.state === 'present' ? 'someone just came into view' : 'you are alone now';
    case 'vision.motion':
      return 'something moved nearby';
    case 'sound.class':
      return `you can hear ${event.label}`;
    case 'sound.loud':
      return 'you heard something loud';
    case 'vision.scene':
      return event.delta;
    default:
      return null;
  }
}

/**
 * Turn what just caught his attention into an idle line.
 *
 * @param events - What caused the filter to fire, most important first.
 * @returns The line. It carries at most two hints: a list of everything noticed
 * reads as a report, and he is meant to be noticing rather than reporting. With
 * nothing worth hinting at, it only says that something did.
 */
export function toIdleLine(events: SenseEvent[]): string {
  const clauses: string[] = [];
  for (const event of events) {
    const clause = describe(event);
    if (clause && !clauses.includes(clause)) clauses.push(clause);
    if (clauses.length === 2) break;
  }
  const hint = clauses.length > 0 ? clauses.join(', and ') : 'something changed around you';
  return `${IDLE_PREFIX} It has been quiet, and ${hint}. Look and listen, and make a remark about it if it is interesting. A remark, not a question.`;
}
