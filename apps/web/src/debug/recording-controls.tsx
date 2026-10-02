/** The buttons for record, replay, save and load. */
import { useRef, useState } from 'react';
import type { Bus } from '../bus/bus.ts';
import { useRecording } from './use-recording.ts';

/** What the controls drive. */
interface RecordingControlsProps {
  /** The bus to capture from and replay onto. */
  bus: Bus;
  /** The brainstem seed in use, stored with the recording. */
  seed: number;
}

/**
 * Record and replay.
 *
 * @param props - The bus and the seed to store with a capture.
 * @returns The row of controls.
 */
export function RecordingControls({ bus, seed }: RecordingControlsProps) {
  const controls = useRecording(bus, seed);
  const [problem, setProblem] = useState<string | null>(null);

  return (
    <div className="m8-chips">
      <button
        type="button"
        className={controls.recording ? 'm8-pin-on' : ''}
        onClick={controls.recording ? controls.finish : controls.start}
      >
        {controls.recording ? `stop (${controls.count})` : 'record'}
      </button>
      <button
        type="button"
        className={controls.playing ? 'm8-pin-on' : ''}
        disabled={controls.count === 0}
        onClick={controls.playing ? controls.halt : controls.play}
      >
        {controls.playing ? 'halt' : 'replay'}
      </button>
      <button type="button" disabled={controls.count === 0} onClick={controls.save}>
        save
      </button>
      <LoadButton onPick={async (file) => setProblem(await controls.load(file))} />
      <span className="m8-detail">{problem ?? `${controls.count} events`}</span>
    </div>
  );
}

/** What the load button reports back. */
interface LoadButtonProps {
  /** Called with the chosen file. */
  onPick: (file: File) => void;
}

/**
 * A button that opens a file picker, because a bare file input cannot be
 * styled to sit next to the others.
 *
 * @param props - What to call with the chosen file.
 * @returns The button and its hidden input.
 */
function LoadButton({ onPick }: LoadButtonProps) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <button
        type="button"
        onClick={() => {
          input.current?.click();
        }}
      >
        load
      </button>
      <input
        ref={input}
        type="file"
        accept="application/json"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onPick(file);
          event.target.value = '';
        }}
      />
    </>
  );
}
