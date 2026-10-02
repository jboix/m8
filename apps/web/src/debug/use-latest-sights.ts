/**
 * The most recent thing tier 1 noticed of each kind, for the preview. It reads
 * the bus rather than the worker, so what the overlay draws is exactly what the
 * character reacted to, not a second opinion about the same frame.
 */
import type { SenseEventOf } from '@m8/shared';
import { useEffect, useState } from 'react';
import type { Bus } from '../bus/bus.ts';

/** How often the preview is handed to React. Fast enough to look live. */
const SAMPLE_MS = 80;

/** How long a sighting stays on the overlay after it stopped arriving. */
const LINGER_MS = 900;

/** The latest of each thing worth drawing. */
export interface Sights {
  /** Where each face in view is, by id. Empty when none has been seen lately. */
  faces: Map<string, SenseEventOf<'vision.face'>>;
  /** Who each face in view is, by id, once the recogniser has judged it. */
  people: Map<string, SenseEventOf<'vision.person'>>;
  /** Where something moved, or `null`. */
  motion: SenseEventOf<'vision.motion'> | null;
  /** The last expression read off a face. */
  expression: SenseEventOf<'vision.expression'> | null;
  /** The last hand gesture. */
  gesture: SenseEventOf<'vision.gesture'> | null;
  /** Whether the character thinks anyone is there. */
  present: boolean;
}

/** Nothing seen yet. */
const NOTHING: Sights = {
  faces: new Map(),
  people: new Map(),
  motion: null,
  expression: null,
  gesture: null,
  present: false,
};

/** The faces in view and who they are, kept between events. */
type Roster = Pick<Sights, 'faces' | 'people'>;

/**
 * Subscribe to every event the overlay draws.
 *
 * @param bus - The bus to read.
 * @param note - Called with whatever changed.
 * @returns The unsubscribes.
 */
function watch(bus: Bus, note: (change: Partial<Sights>) => void, roster: Roster) {
  const { faces, people } = roster;
  return [
    bus.on('vision.face', (face) => {
      faces.set(face.id, face);
      note({ faces: new Map(faces) });
    }),
    bus.on('vision.face.lost', (lost) => {
      faces.delete(lost.id);
      people.delete(lost.id);
      note({ faces: new Map(faces), people: new Map(people) });
    }),
    bus.on('vision.person', (person) => {
      people.set(person.id, person);
      note({ people: new Map(people) });
    }),
    bus.on('vision.motion', (motion) => {
      note({ motion });
    }),
    bus.on('vision.expression', (expression) => {
      note({ expression });
    }),
    bus.on('vision.gesture', (gesture) => {
      note({ gesture });
    }),
    bus.on('presence', (event) => {
      note({ present: event.state === 'present' });
    }),
  ];
}

/**
 * Watch what tier 1 is reporting.
 *
 * @param bus - The bus to read.
 * @returns The latest sighting of each kind, refreshed a dozen times a second.
 */
export function useLatestSights(bus: Bus): Sights {
  const [sights, setSights] = useState<Sights>(NOTHING);

  useEffect(() => {
    let current = NOTHING;
    const offs = watch(
      bus,
      (change) => {
        current = { ...current, ...change };
      },
      { faces: new Map(), people: new Map() },
    );

    const timer = setInterval(() => {
      const now = performance.now();
      // Let a stale sighting fade rather than leaving a box over an empty room.
      if (current.motion && now - current.motion.ts > LINGER_MS) {
        current = { ...current, motion: null };
      }
      setSights(current);
    }, SAMPLE_MS);

    return () => {
      for (const off of offs) off();
      clearInterval(timer);
    };
  }, [bus]);

  return sights;
}
