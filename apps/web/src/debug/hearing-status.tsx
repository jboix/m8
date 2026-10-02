/**
 * What the second microphone track is doing, and the switch that closes it.
 *
 * The level is the useful part: it is the only place you can see that the raw
 * track is open and that the character's own voice is being kept out of it.
 */
import type { HearingState } from '../senses/audio/start-hearing.ts';

/** What the row shows and drives. */
interface HearingStatusProps {
  /** What ambient hearing is doing. */
  ears: HearingState;
  /** Whether the raw track is wanted. */
  hearing: boolean;
  /** Turns it on and off. */
  onHearing: (wanted: boolean) => void;
}

/**
 * Describe the state in a few words.
 *
 * @param ears - What it is doing.
 * @returns The line to show.
 */
function describe(ears: HearingState): string {
  switch (ears.status) {
    case 'off':
      return 'not listening to the room';
    case 'starting':
      return 'opening the raw track';
    case 'loading':
      return 'loading yamnet';
    case 'listening':
      return `${ears.db} dB`;
    default:
      return ears.message;
  }
}

/**
 * The hearing row.
 *
 * @param props - The state and the switch.
 * @returns The row.
 */
export function HearingStatus({ ears, hearing, onHearing }: HearingStatusProps) {
  return (
    <div className="m8-chips">
      <button
        type="button"
        className={ears.status === 'listening' ? 'm8-pin-on' : 'm8-chip-off'}
        onClick={() => {
          onHearing(!hearing);
        }}
      >
        room {hearing ? 'on' : 'off'}
      </button>
      <span className={ears.status === 'failed' ? 'm8-fault' : 'm8-detail'}>{describe(ears)}</span>
    </div>
  );
}
