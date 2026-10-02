/**
 * The eyes' sounds in the debug panel. Every sound can be
 * switched off by itself, and fired by itself so it can be heard without
 * waiting for the rig to do the thing that makes it.
 */
import type { FoleySound } from '../voice/foley.ts';
import type { FoleySettings } from '../voice/foley-cues.ts';

/** What the panel needs. */
interface FoleyPanelProps {
  /** Which sounds are on. */
  foley: FoleySettings;
  /** Changes them. */
  onFoley: (settings: FoleySettings) => void;
  /** Plays one sound now. Silent while no session has a voice running. */
  onPlayFoley: (sound: FoleySound) => void;
}

/** The switches, in the order they are shown, with their labels. */
const SWITCHES: { key: Exclude<keyof FoleySettings, 'volume'>; label: string }[] = [
  { key: 'on', label: 'sounds' },
  { key: 'emotion', label: 'emotions' },
  { key: 'servo', label: 'servo' },
  { key: 'blink', label: 'blink' },
  { key: 'squash', label: 'squash' },
  { key: 'gesture', label: 'gesture' },
];

/**
 * The sounds only the rig's own motion makes. The rest are fired by the emotion
 * and gesture chips, so they need no buttons here.
 */
const MOTION_SOUNDS: FoleySound[] = ['servo', 'blink', 'squeak'];

/**
 * The switches and the buttons.
 *
 * @param props - The settings and the two ways of changing what is heard.
 * @returns A row of switches, then a button for each motion sound.
 */
export function FoleyPanel({ foley, onFoley, onPlayFoley }: FoleyPanelProps) {
  return (
    <>
      <div className="m8-chips">
        {SWITCHES.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            className={foley[key] ? 'm8-pin-on' : 'm8-chip-off'}
            aria-pressed={foley[key]}
            onClick={() => {
              onFoley({ ...foley, [key]: !foley[key] });
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="m8-chips">
        {MOTION_SOUNDS.map((sound) => (
          <button
            key={sound}
            type="button"
            onClick={() => {
              onPlayFoley(sound);
            }}
          >
            play {sound}
          </button>
        ))}
      </div>
    </>
  );
}
