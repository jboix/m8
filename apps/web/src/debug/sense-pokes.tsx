/**
 * Puts a sense event on the bus by hand.
 *
 * Section 12 asks for fusion to be testable without sitting in front of the
 * camera. Recording and replay covers a whole session; this covers the other
 * case, which is wanting to see what one wave does, five times in a row,
 * without waving five times.
 */
import type { SenseEvent } from '@m8/shared';
import type { Bus } from '../bus/bus.ts';

/** What the buttons publish. */
const POKES: { label: string; make: () => SenseEvent }[] = [
  { label: 'wave', make: () => ({ type: 'vision.gesture', ts: performance.now(), kind: 'wave' }) },
  {
    label: 'smile',
    make: () => ({ type: 'vision.expression', ts: performance.now(), id: 'face', kind: 'smile' }),
  },
  {
    label: 'arrived',
    make: () => ({ type: 'presence', ts: performance.now(), state: 'present' }),
  },
  { label: 'left', make: () => ({ type: 'presence', ts: performance.now(), state: 'absent' }) },
  { label: 'looking', make: () => ({ type: 'alone', ts: performance.now(), stage: 'looking' }) },
  { label: 'drowsy', make: () => ({ type: 'alone', ts: performance.now(), stage: 'drowsy' }) },
  { label: 'dozing', make: () => ({ type: 'alone', ts: performance.now(), stage: 'dozing' }) },
  { label: 'asleep', make: () => ({ type: 'alone', ts: performance.now(), stage: 'asleep' }) },
  { label: 'bang', make: () => ({ type: 'sound.loud', ts: performance.now(), db: 82 }) },
];

/** What the row publishes to. */
interface SensePokesProps {
  /** The bus the events go on, exactly as a real sense would put them there. */
  bus: Bus;
}

/**
 * A button per thing worth pretending happened.
 *
 * @param props - The bus to publish to.
 * @returns The row.
 */
export function SensePokes({ bus }: SensePokesProps) {
  return (
    <div className="m8-chips">
      {POKES.map((poke) => (
        <button
          key={poke.label}
          type="button"
          onClick={() => {
            bus.publish(poke.make());
          }}
        >
          {poke.label}
        </button>
      ))}
    </div>
  );
}
