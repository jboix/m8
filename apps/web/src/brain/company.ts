/**
 * Who is in front of him right now, as far as the senses can tell: each face
 * in view, its name when the recogniser has one, and whether it is talking.
 * Built from the bus, so it costs nothing until a tool asks.
 */
import type { Bus, Unsubscribe } from '../bus/bus.ts';

/** How long after a talking frame a face still counts as talking. */
const TALKING_LASTS_MS = 1800;

/** One person in view. */
export interface Someone {
  /** Their track. */
  id: string;
  /** Their name, or `null` when he does not know them by sight. */
  name: string | null;
  /** Where they are across the frame, 0 left to 1 right. */
  x: number;
  /** Whether their mouth has been moving lately. */
  talking: boolean;
}

/** The people in view. */
export interface Company {
  /** Everybody in view, left to right. */
  present(): Someone[];
  /** Stop listening. */
  stop(): void;
}

/** What is kept per face. */
interface Seen {
  name: string | null;
  x: number;
  talkedAt: number;
}

/**
 * Keep the roster up to date from the bus.
 *
 * @param bus - Where the sense events arrive.
 * @param seen - The roster, mutated in place.
 * @param now - The clock.
 * @returns The unsubscribes.
 */
function follow(bus: Bus, seen: Map<string, Seen>, now: () => number): Unsubscribe[] {
  return [
    bus.on('vision.face', (event) => {
      const known = seen.get(event.id);
      seen.set(event.id, {
        name: known?.name ?? null,
        x: event.x,
        talkedAt: known?.talkedAt ?? Number.NEGATIVE_INFINITY,
      });
    }),
    bus.on('vision.face.lost', (event) => {
      seen.delete(event.id);
    }),
    bus.on('vision.person', (event) => {
      const known = seen.get(event.id);
      if (known) known.name = event.name;
    }),
    bus.on('vision.expression', (event) => {
      const known = seen.get(event.id);
      if (known && event.kind === 'talking') known.talkedAt = now();
    }),
  ];
}

/**
 * Follow the bus and keep the roster.
 *
 * @param bus - Where the sense events arrive.
 * @param now - Clock, injected for tests. Defaults to `performance.now`.
 * @returns The roster, already listening.
 */
export function createCompany(bus: Bus, now = () => performance.now()): Company {
  const seen = new Map<string, Seen>();
  const listeners = follow(bus, seen, now);

  return {
    present: () =>
      [...seen.entries()]
        .map(([id, face]) => ({
          id,
          name: face.name,
          x: face.x,
          talking: now() - face.talkedAt < TALKING_LASTS_MS,
        }))
        .sort((a, b) => a.x - b.x),
    stop: () => {
      for (const off of listeners) off();
    },
  };
}

/**
 * Where somebody stands, when there is more than one to tell apart.
 *
 * @param index - Their place from the left.
 * @param count - How many there are.
 * @returns " (left)", " (middle)", " (right)", or nothing when they are alone.
 */
function placeOf(index: number, count: number): string {
  if (count < 2) return '';
  if (index === 0) return ' (left)';
  return index === count - 1 ? ' (right)' : ' (middle)';
}

/**
 * One person, as the model is told about them.
 *
 * @param person - Who.
 * @param index - Their place from the left.
 * @param count - How many there are.
 * @returns "Ada (left), talking" and the like.
 */
function describeSomeone(person: Someone, index: number, count: number): string {
  const name = person.name ?? 'somebody you do not know by sight';
  return `${name}${placeOf(index, count)}${person.talking ? ', talking' : ''}`;
}

/**
 * The roster as a sentence for the model.
 *
 * @param people - Everybody in view, left to right.
 * @param knowsFaces - Whether he can tell faces apart at all.
 * @returns What to tell him.
 */
export function describeCompany(people: Someone[], knowsFaces: boolean): string {
  if (people.length === 0) return 'Nobody is in front of you right now.';
  const who = people.map((person, index) => describeSomeone(person, index, people.length));
  const count = people.length === 1 ? 'One person' : `${people.length} people`;
  const note = knowsFaces
    ? ''
    : ' You cannot tell faces apart: it is switched off in the settings.';
  return `${count} in front of you: ${who.join('; ')}.${note}`;
}

/** What `name_face` tells the model. In English, like the persona and the tool descriptions. */
export const NAME_FACE_ANSWERS = {
  /** Recognition is off in the settings. */
  facesOff: 'You cannot learn faces: it is switched off in the settings. Say so if it comes up.',
  /** There is no face in view at all. */
  nobody:
    'You cannot see anybody right now. Ask them to come in front of the camera, and try again.',
  /** A face is in view, but too small or turned away to embed. */
  notYet:
    'You can see them, but not well enough yet. Ask them to come a little closer and look at you, and try again in a moment.',
  /**
   * The face was learned.
   * @param name - Whose.
   * @returns The sentence.
   */
  learned: (name: string) => `You will know ${name} by sight from now on.`,
};
