/**
 * The controls the person always has: turn the camera off, mute the microphone,
 * and open the settings. They sit on the stage itself, in a column in the
 * corner, with the way into the rig when the developer options are on. When the button
 * marks the turns, the talk button sits on its own at the bottom middle.
 */
import { useEffect, useRef } from 'react';
import type { Bus } from './bus/bus.ts';
import type { SettingsStrings } from './settings/strings.ts';

/** The talk button's state, when there is one. */
export interface TalkControl {
  /** Whether it is held. */
  talking: boolean;
  /** Presses and releases it. */
  onTalking: (talking: boolean) => void;
  /** Where the person's voice level is published, for the button to move with. */
  bus: Bus;
}

/** What the controls need. */
interface StageControlsProps {
  /** Whether the microphone is muted. */
  muted: boolean;
  /** Mutes and unmutes it. */
  onMuted: (muted: boolean) => void;
  /** Whether the camera is on. */
  camera: boolean;
  /** Turns it on and off. */
  onCamera: (camera: boolean) => void;
  /** The talk button, or null when the model marks the turns by itself. */
  talk: TalkControl | null;
  /** What the buttons say to a screen reader, in the person's language. */
  strings: Pick<SettingsStrings, 'title' | 'holdToTalk' | 'openRig'>;
  /** Opens the settings sheet. */
  onSettings: () => void;
  /** Opens the rig, or null when the developer options are off. */
  onRig: (() => void) | null;
}

/** What one control needs. */
interface ControlProps {
  /** True when the thing it controls is off: muted, or the camera stopped. */
  off: boolean;
  /** What it says to a screen reader, which depends on its state. */
  label: string;
  /** Flips it. */
  onFlip: () => void;
  /** The icon's outline, drawn in a 24 by 24 box. */
  icon: string;
}

/** A microphone: a capsule on a stand. */
const MICROPHONE =
  'M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3ZM6 11a6 6 0 0 0 12 0M12 17v4M9 21h6';

/** A camera: a body with a lens on its side. */
const CAMERA =
  'M4 7h10a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1ZM15 11l6-3v8l-6-3';

/** A gear: sliders would read as a mixer, and a gear reads as settings everywhere. */
const GEAR =
  'M12 9a3 3 0 1 0 0 6a3 3 0 0 0 0-6ZM19 12a7 7 0 0 0-.1-1.3l2-1.5l-2-3.4l-2.3.9a7 7 0 0 0-2.2-1.3L14 3h-4l-.4 2.4a7 7 0 0 0-2.2 1.3l-2.3-.9l-2 3.4l2 1.5a7 7 0 0 0 0 2.6l-2 1.5l2 3.4l2.3-.9a7 7 0 0 0 2.2 1.3L10 21h4l.4-2.4a7 7 0 0 0 2.2-1.3l2.3.9l2-3.4l-2-1.5A7 7 0 0 0 19 12Z';

/** A bug: the rig is for debugging. */
const BUG =
  'M9 7a3 3 0 0 1 6 0M8 9h8v5a4 4 0 0 1-8 0ZM12 9v9M4 11h4M16 11h4M5 17l3-2M19 17l-3-2M6 5l2.5 2.5M18 5l-2.5 2.5';

/** A speech bubble: what the talk button is for. */
const BUBBLE = 'M5 5h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-8l-5 4v-4H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z';

/**
 * One round control. Off is shown by a slash through the icon and a warm
 * colour, so the state reads without the label.
 *
 * @param props - Its state, its label, its icon and what it does.
 * @returns The button.
 */
function Control({ off, label, onFlip, icon }: ControlProps) {
  return (
    <button type="button" className="m8-control" data-off={off} aria-label={label} onClick={onFlip}>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d={icon} />
        {off ? <path className="m8-control-slash" d="M4 4l16 16" /> : null}
      </svg>
    </button>
  );
}

/**
 * Whether a key press belongs to something that takes typing.
 *
 * @param target - What the key went to.
 * @returns True for a text field, a select or anything editable.
 */
function typing(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

/**
 * Hold the space bar to talk, like the button. The bar goes up when the tab
 * loses focus too, so a turn cannot be left open by switching away.
 *
 * @param talk - The talk button, or null when there is none to stand in for.
 */
function useHoldSpaceToTalk(talk: TalkControl | null): void {
  const onTalking = talk?.onTalking ?? null;
  useEffect(() => {
    if (!onTalking) return;
    const down = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || event.repeat || typing(event.target)) return;
      event.preventDefault();
      onTalking(true);
    };
    const up = (event: KeyboardEvent) => {
      if (event.code === 'Space') onTalking(false);
    };
    const release = () => {
      onTalking(false);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', release);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', release);
    };
  }, [onTalking]);
}

/**
 * Move the talk button with the person's voice. The level is written to a CSS
 * variable on the element, so the bounce costs no render.
 *
 * @param bus - Where the level is published. It is zero whenever the button
 * is not held, because the frames the model gets are silence then.
 * @returns The ref to put on the button.
 */
function useVoiceBounce(bus: Bus) {
  const button = useRef<HTMLButtonElement>(null);
  useEffect(
    () =>
      bus.on('voice.level', (event) => {
        if (event.who !== 'other') return;
        button.current?.style.setProperty('--voice', event.level.toFixed(3));
      }),
    [bus],
  );
  return button;
}

/**
 * The talk button. Held, not clicked: the turn lasts as long as the press. It
 * bounces with the person's voice while it is held, so they can see they are
 * being heard.
 *
 * @param props - Its state, the way to press it, the bus and its label.
 * @returns The button.
 */
function TalkButton({ talking, onTalking, bus, label }: TalkControl & { label: string }) {
  const button = useVoiceBounce(bus);
  return (
    <button
      ref={button}
      type="button"
      className="m8-talk"
      data-held={talking}
      aria-label={label}
      aria-pressed={talking}
      onPointerDown={(event) => {
        // Captured, so a finger that slides off the button still releases it.
        event.currentTarget.setPointerCapture(event.pointerId);
        onTalking(true);
      }}
      onPointerUp={() => {
        onTalking(false);
      }}
      onPointerCancel={() => {
        onTalking(false);
      }}
      onLostPointerCapture={() => {
        onTalking(false);
      }}
      onContextMenu={(event) => {
        // A long press on a phone would open the menu and drop the turn.
        event.preventDefault();
      }}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d={BUBBLE} />
      </svg>
    </button>
  );
}

/**
 * The camera, mute, settings and rig controls, and the talk button when the
 * person marks the turns.
 *
 * @param props - The states, the ways to change them, and the ways into the
 * settings and the rig.
 * @returns The controls, a column in the corner of the stage, and the talk
 * button at the bottom middle.
 */
export function StageControls(props: StageControlsProps) {
  const { talk, strings } = props;
  useHoldSpaceToTalk(talk);
  return (
    <>
      {talk ? <TalkButton {...talk} label={strings.holdToTalk} /> : null}
      <CornerControls {...props} />
    </>
  );
}

/**
 * The column in the corner: camera, microphone, settings, and the rig.
 *
 * @param props - The states, the ways to change them, and the ways into the
 * settings and the rig.
 * @returns The column.
 */
function CornerControls(props: StageControlsProps) {
  const { muted, onMuted, camera, onCamera, strings, onSettings, onRig } = props;
  return (
    <div className="m8-controls">
      <Control
        off={!camera}
        label={camera ? 'Turn the camera off' : 'Turn the camera on'}
        icon={CAMERA}
        onFlip={() => {
          onCamera(!camera);
        }}
      />
      <Control
        off={muted}
        label={muted ? 'Unmute the microphone' : 'Mute the microphone'}
        icon={MICROPHONE}
        onFlip={() => {
          onMuted(!muted);
        }}
      />
      <Control off={false} label={strings.title} icon={GEAR} onFlip={onSettings} />
      {onRig ? <Control off={false} label={strings.openRig} icon={BUG} onFlip={onRig} /> : null}
    </div>
  );
}
