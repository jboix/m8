/**
 * Record what crosses the bus, save it, load it back and play it. The point is
 * to be able to work on fusion and mood without sitting in front of a camera,
 * and to tune them against an input that is the same every time.
 */
import { Recording } from '@m8/shared';
import { type RefObject, useCallback, useEffect, useRef, useState } from 'react';
import type { Bus } from '../bus/bus.ts';
import { type Player, playRecording } from '../bus/player.ts';
import { type Recorder, startRecording } from '../bus/recorder.ts';

/** What the panel can do with recordings, and what it is doing now. */
export interface RecordingControls {
  /** True while capturing. */
  recording: boolean;
  /** True while playing back. */
  playing: boolean;
  /** Events captured so far, or held in the loaded recording. */
  count: number;
  /** Start capturing. */
  start(): void;
  /** Stop capturing and keep the result. */
  finish(): void;
  /** Replay what is held. */
  play(): void;
  /** Stop a replay early. */
  halt(): void;
  /** Write what is held to a file. */
  save(): void;
  /**
   * Read a file into memory.
   * @param file - The JSON a previous `save` produced.
   * @returns The failure, or `null` when it loaded.
   */
  load(file: File): Promise<string | null>;
}

/** The recording the panel currently holds, if any. */
type Held = RefObject<Recording | null>;

/**
 * Capturing half: start, stop, and the count while it runs.
 *
 * @param bus - The bus to capture from.
 * @param seed - The brainstem seed to store with the result.
 * @param held - Where a finished capture is kept.
 * @param onCount - Called with the number of events once a capture finishes.
 * @returns The capture controls.
 */
function useCapture(bus: Bus, seed: number, held: Held, onCount: (count: number) => void) {
  const recorder = useRef<Recorder | null>(null);
  const [recording, setRecording] = useState(false);

  const start = useCallback(() => {
    recorder.current = startRecording(bus, seed);
    setRecording(true);
    onCount(0);
  }, [bus, seed, onCount]);

  const finish = useCallback(() => {
    if (!recorder.current) return;
    held.current = recorder.current.stop(new Date().toISOString().slice(11, 19));
    recorder.current = null;
    setRecording(false);
    onCount(held.current.events.length);
  }, [held, onCount]);

  useEffect(
    () => () => {
      recorder.current?.stop('');
    },
    [],
  );

  return { recording, start, finish };
}

/**
 * Playback half: play, halt, and whether it is running.
 *
 * @param bus - The bus to replay onto.
 * @param held - The recording to play.
 * @returns The playback controls.
 */
function usePlayback(bus: Bus, held: Held) {
  const player = useRef<Player | null>(null);
  const [playing, setPlaying] = useState(false);

  const halt = useCallback(() => {
    player.current?.stop();
    player.current = null;
    setPlaying(false);
  }, []);

  const play = useCallback(() => {
    if (!held.current) return;
    player.current?.stop();
    setPlaying(true);
    player.current = playRecording(bus, held.current, { onFinished: halt });
  }, [bus, held, halt]);

  useEffect(
    () => () => {
      player.current?.stop();
    },
    [],
  );

  return { playing, play, halt };
}

/**
 * Wire the recorder and the player to a bus.
 *
 * @param bus - The bus to capture from and replay onto.
 * @param seed - The brainstem seed to store, so a replay repeats the blinks too.
 * @returns The controls, and what they are doing.
 */
export function useRecording(bus: Bus, seed: number): RecordingControls {
  const held = useRef<Recording | null>(null);
  const [count, setCount] = useState(0);
  const onCount = useCallback((next: number) => {
    setCount(next);
  }, []);
  const capture = useCapture(bus, seed, held, onCount);
  const playback = usePlayback(bus, held);

  const save = useCallback(() => {
    if (held.current) download(held.current);
  }, []);

  const load = useCallback(async (file: File) => {
    // The one place an event arrives from outside the app, so the one place
    // the schema earns its keep.
    const parsed = Recording.safeParse(await readJson(file));
    if (!parsed.success) return parsed.error.issues[0]?.message ?? 'not a recording';
    held.current = parsed.data;
    setCount(parsed.data.events.length);
    return null;
  }, []);

  return { ...capture, ...playback, count, save, load };
}

/**
 * Parse a file as JSON.
 *
 * @param file - The file.
 * @returns Its contents, or `null` when it is not JSON at all.
 */
async function readJson(file: File): Promise<unknown> {
  try {
    return JSON.parse(await file.text());
  } catch {
    return null;
  }
}

/**
 * Hand a recording to the browser as a download.
 *
 * @param recording - What to write.
 */
function download(recording: Recording): void {
  const blob = new Blob([JSON.stringify(recording)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `m8-${recording.recordedAt}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}
