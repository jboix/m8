/**
 * What the brain is doing: the state of the session, what was said, and every
 * tool the model called. Section 12 calls this the session inspector, and it is
 * the only way to see a conversation that is otherwise made of sound.
 */
import { VoiceName } from '@m8/shared';
import { useState } from 'react';
import type { Brain, VoiceSettings } from '../brain/use-brain.ts';

/** What the inspector shows and drives. */
interface SessionInspectorProps {
  /** What the session is doing, and the way to put words into it. */
  brain: Brain;
  /** Whether a session is wanted. */
  listening: boolean;
  /** Opens and closes the session, which is also how the microphone is released. */
  onListening: (wanted: boolean) => void;
  /** Whether anyone is there. With a camera running, this gates the session. */
  present: boolean;
  /** How the character sounds. */
  sound: VoiceSettings;
  /** Changes it. Picking a voice reopens the session; the effect is immediate. */
  onSound: (sound: VoiceSettings) => void;
}

/**
 * Markers the transcriber leaves in the stream, such as `<no speech detected>`
 * and `{pause}`. They describe the audio rather than report anything said.
 */
const MARKERS = /<[^>]*>|\{[^}]*\}/g;

/**
 * Drop the transcriber's commentary from a line.
 *
 * @remarks
 * The removal repeats until nothing changes, so no marker can survive however
 * the markers are nested. The line is shown as text, never as HTML.
 *
 * @param text - The assembled line.
 * @returns What was actually said, which can be nothing at all.
 */
export function spoken(text: string): string {
  let before: string;
  let after = text;
  do {
    before = after;
    after = before.replace(MARKERS, '');
  } while (after !== before);
  return after.trim();
}

/**
 * Describe the session in a few words.
 *
 * @param brain - What the session is doing.
 * @param listening - Whether one was asked for.
 * @returns The line to show.
 */
function describe(brain: Brain, listening: boolean, present: boolean): string {
  if (!listening) return 'not listening';
  if (brain.state === 'failed') return brain.detail ?? 'failed';
  if (brain.state === 'sleeping' && !present) return 'asleep: nobody there';
  return brain.state;
}

/**
 * Which voice, and how much machine on top.
 *
 * @remarks
 * A timbre cannot be judged from a name, so the only way to choose one is to
 * hear it. Picking reopens the session, because the voice is fixed in the setup
 * frame; the effect is in the browser and changes as you drag it.
 *
 * @param props - The current settings and how to change them.
 * @returns The picker and the slider.
 */
function VoiceControls({ sound, onSound }: Pick<SessionInspectorProps, 'sound' | 'onSound'>) {
  return (
    <div className="m8-chips">
      <select
        className="m8-pick"
        value={sound.voice}
        onChange={(event) => {
          onSound({ ...sound, voice: VoiceName.parse(event.target.value) });
        }}
      >
        {VoiceName.options.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </select>
      <span className="m8-name">robot</span>
      <input
        className="m8-slider"
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={sound.robot}
        onChange={(event) => {
          onSound({ ...sound, robot: Number(event.target.value) });
        }}
      />
      <span className="m8-value">{sound.robot.toFixed(2)}</span>
      <button
        type="button"
        className={sound.halfDuplex ? 'm8-pin-on' : ''}
        onClick={() => {
          onSound({ ...sound, halfDuplex: !sound.halfDuplex });
        }}
      >
        {sound.halfDuplex ? 'deaf while talking' : 'hears while talking'}
      </button>
    </div>
  );
}

/**
 * A line typed into the session by hand, as a silent note or as something to
 * answer. The same two calls fusion makes, and the only way to try the brain
 * without talking to it.
 *
 * @param props - The running session.
 * @returns The input and its two buttons, under the transcript like a console prompt.
 */
function Prompt({ brain }: { brain: Brain }) {
  const [text, setText] = useState('[idle] You are bored. Start something from what you can see.');
  return (
    <div className="m8-prompt">
      <input
        className="m8-say"
        aria-label="Words to put into the session"
        value={text}
        onChange={(event) => {
          setText(event.target.value);
        }}
      />
      <button
        type="button"
        onClick={() => {
          brain.say(text, false);
        }}
      >
        note
      </button>
      <button
        type="button"
        onClick={() => {
          brain.say(text, true);
        }}
      >
        interrupt
      </button>
    </div>
  );
}

/**
 * The session inspector.
 *
 * @param props - The session, and the switch that opens it.
 * @returns The panel section.
 */
export function SessionInspector({
  brain,
  listening,
  onListening,
  present,
  sound,
  onSound,
}: SessionInspectorProps) {
  const failed = listening && brain.state === 'failed';
  return (
    <>
      <div className="m8-chips">
        <button
          type="button"
          className={listening ? 'm8-pin-on' : ''}
          onClick={() => {
            onListening(!listening);
          }}
        >
          {listening ? 'listening' : 'listen'}
        </button>
        <span className={failed ? 'm8-fault' : 'm8-detail'}>
          {describe(brain, listening, present)}
        </span>
      </div>

      <VoiceControls sound={sound} onSound={onSound} />

      {brain.calls.length === 0 ? null : (
        <ol className="m8-timeline">
          {brain.calls.map((call) => (
            <li key={`${call.at}-${call.input}`}>
              <span className="m8-age">tool</span>
              <span className="m8-kind">{call.name}</span>
              <span className="m8-detail">{call.input}</span>
            </li>
          ))}
        </ol>
      )}

      {brain.transcript.length === 0 ? null : (
        <ol className="m8-transcript m8-chat">
          {brain.transcript
            .map((line) => ({ ...line, text: spoken(line.text) }))
            .filter((line) => line.text.length > 0)
            .map((line) => (
              <li key={line.seq} className={line.role === 'model' ? 'm8-said' : ''}>
                {line.text}
              </li>
            ))}
        </ol>
      )}

      {listening ? <Prompt brain={brain} /> : null}
    </>
  );
}
