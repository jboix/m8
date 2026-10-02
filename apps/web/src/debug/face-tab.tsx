/**
 * The face tab: what the eyes are doing, and the ways to make them do it. The
 * two rows used all the time are always open. Everything else folds.
 */
import { Emotion, GestureKind } from '@m8/shared';
import { useEffect, useState } from 'react';
import type { EyesController } from '../eyes/index.ts';
import { RIG_PARAM_NAMES, type RigParamName, rigRange } from '../eyes/rig.ts';
import type { FoleySound } from '../voice/foley.ts';
import type { FoleySettings } from '../voice/foley-cues.ts';
import { FlourishPanel } from './flourish-panel.tsx';
import { FoleyPanel } from './foley-panel.tsx';
import { Section } from './section.tsx';

/** How often the panel samples the rig. Fast enough to read, slow enough to be free. */
const SAMPLE_MS = 100;

/** What the panel reads off the rig. */
interface RigSnapshot {
  /** The pose as last drawn. */
  pose: ReturnType<EyesController['inspector']['pose']>;
  /** The parameters pinned by a slider. */
  overrides: ReturnType<EyesController['inspector']['overrides']>;
  /** Whether the brainstem is frozen. */
  frozen: boolean;
  /** The emotion currently held. */
  emotion: Emotion;
}

/**
 * Read the rig once.
 *
 * @param controller - The rig.
 * @returns What the face tab shows.
 */
function readRig({ inspector }: EyesController): RigSnapshot {
  return {
    pose: inspector.pose(),
    overrides: inspector.overrides(),
    frozen: inspector.isBrainstemFrozen(),
    emotion: inspector.expression().emotion,
  };
}

/**
 * Sample the rig while the panel is open.
 *
 * @param controller - The rig.
 * @returns The latest sample. The rig's own loop never touches React, so the
 * panel polls it.
 */
function useRigSnapshot(controller: EyesController): RigSnapshot {
  const [snapshot, setSnapshot] = useState(() => readRig(controller));
  useEffect(() => {
    const timer = setInterval(() => {
      setSnapshot(readRig(controller));
    }, SAMPLE_MS);
    return () => {
      clearInterval(timer);
    };
  }, [controller]);
  return snapshot;
}

/** What one slider needs. */
interface SliderProps {
  /** Which parameter. */
  name: RigParamName;
  /** Its value now. */
  value: number;
  /** Whether a slider has pinned it. */
  pinned: boolean;
  /** The rig. */
  controller: EyesController;
}

/**
 * One parameter: its slider, its value, and whether it is pinned.
 *
 * @param props - The parameter and the rig.
 * @returns The row.
 */
function Slider({ name, value, pinned, controller }: SliderProps) {
  const { min, max } = rigRange(name);
  return (
    <label className="m8-row">
      <span className="m8-name">{name}</span>
      <input
        className="m8-slider"
        type="range"
        min={min}
        max={max}
        step={0.01}
        value={value}
        onChange={(event) => {
          controller.inspector.override(name, Number(event.target.value));
        }}
      />
      <span className="m8-value">{value.toFixed(2)}</span>
      <button
        type="button"
        className={pinned ? 'm8-pin m8-pin-on' : 'm8-pin'}
        onClick={() => {
          controller.inspector.override(name, pinned ? null : value);
        }}
      >
        {pinned ? 'pinned' : 'live'}
      </button>
    </label>
  );
}

/** What a row that only needs the rig takes. */
interface RigProps {
  /** The rig. */
  controller: EyesController;
}

/**
 * One chip per emotion, with the one he is holding lit.
 *
 * @param props - The rig, and the emotion currently held.
 * @returns The row.
 */
function EmotionRow({ controller, held }: RigProps & { held: Emotion }) {
  return (
    <div className="m8-chips m8-chips-scroll">
      {Emotion.options.map((option) => (
        <button
          key={option}
          type="button"
          className={option === held ? 'm8-pin-on' : undefined}
          aria-pressed={option === held}
          onClick={() => {
            controller.controls.setEmotion(option, 1);
          }}
        >
          {option}
        </button>
      ))}
    </div>
  );
}

/**
 * One chip per gesture. Pressing the same one again restarts it.
 *
 * @param props - The rig.
 * @returns The row.
 */
function GestureRow({ controller }: RigProps) {
  return (
    <div className="m8-chips m8-chips-scroll">
      {GestureKind.options.map((kind) => (
        <button
          key={kind}
          type="button"
          onClick={() => {
            controller.controls.gesture(kind);
          }}
        >
          {kind}
        </button>
      ))}
    </div>
  );
}

/**
 * The brainstem switch and a slider per rig parameter.
 *
 * @param props - The rig and what was last read off it.
 * @returns The switch, then the sliders.
 */
function Sliders({ controller, rig }: RigProps & { rig: RigSnapshot }) {
  const { frozen, overrides, pose } = rig;
  return (
    <>
      <div className="m8-chips">
        <button
          type="button"
          className={frozen ? 'm8-pin m8-pin-on' : 'm8-pin'}
          aria-pressed={frozen}
          onClick={() => {
            controller.inspector.freezeBrainstem(!frozen);
          }}
        >
          brainstem {frozen ? 'frozen' : 'running'}
        </button>
      </div>
      <div className="m8-sliders">
        {RIG_PARAM_NAMES.map((name) => (
          <Slider
            key={name}
            name={name}
            value={overrides[name] ?? pose[name]}
            pinned={overrides[name] !== undefined}
            controller={controller}
          />
        ))}
      </div>
    </>
  );
}

/** What the face tab needs. */
interface FaceTabProps {
  /** The rig. */
  controller: EyesController;
  /** Which of the eyes' sounds are on. */
  foley: FoleySettings;
  /** Changes them. */
  onFoley: (settings: FoleySettings) => void;
  /** Plays one of the eyes' sounds now. */
  onPlayFoley: (sound: FoleySound) => void;
}

/**
 * The face tab.
 *
 * @remarks
 * An emotion chip sets the emotion at full strength, which also shows its
 * flourish and plays its sound. That is why neither of those has a row of
 * buttons of its own any more.
 *
 * @param props - The rig and the sound settings.
 * @returns Emotions and gestures, then the folded sections.
 */
export function FaceTab({ controller, foley, onFoley, onPlayFoley }: FaceTabProps) {
  const rig = useRigSnapshot(controller);
  return (
    <>
      <p className="m8-label">emotions</p>
      <EmotionRow controller={controller} held={rig.emotion} />
      <p className="m8-label">gestures</p>
      <GestureRow controller={controller} />
      <Section title="flourishes">
        <FlourishPanel controller={controller} />
      </Section>
      <Section title="eye sounds">
        <FoleyPanel {...{ foley, onFoley, onPlayFoley }} />
      </Section>
      <Section title="sliders">
        <Sliders controller={controller} rig={rig} />
      </Section>
    </>
  );
}
