/**
 * Ambient hearing, wired up: raw track to worker to bus.
 *
 * The only module that knows all the pieces exist, and the one place the
 * character's own voice is kept out of its ears.
 */
import type { Bus } from '../../bus/bus.ts';
import { startAmbient } from './ambient.ts';
import { deriveSound, type HearingMemory, newHearingMemory } from './derive-sound.ts';
import type { FromWorker } from './hearing-protocol.ts';
import { overlapsSpeech } from './self-voice.ts';
import { AMBIENT_RATE, type AmbientWindow } from './windows.ts';

/**
 * The worker and the wasm runtime, put into `public/` by
 * `scripts/vendor-workers.ts` and served untouched. That script says why.
 */
const WORKER = '/hearing/ambient.worker.js';
const WASM_LOADER = '/hearing/audio_wasm_internal.js';
const WASM_BINARY = '/hearing/audio_wasm_internal.wasm';

/** Where YAMNet is fetched from. Cached by the browser after the first run. */
const MODEL =
  'https://storage.googleapis.com/mediapipe-models/audio_classifier/yamnet/float32/1/yamnet.tflite';

/** How often the speaking flag is sampled. Cheap, and it only reads a boolean. */
const WATCH_MS = 100;

/** What ambient hearing is doing. */
export type HearingState =
  | { status: 'off' }
  | { status: 'starting' }
  | { status: 'loading' }
  | { status: 'listening'; db: number }
  | { status: 'failed'; message: string };

/** A running ear. */
export interface Hearing {
  /** Stop listening and tear the worker down. */
  stop(): void;
}

/** How hearing is wired. */
export interface HearingOptions {
  /** Where the derived events go. */
  bus: Bus;
  /** Whether the character is talking right now. */
  speaking: () => boolean;
  /** Called whenever the state changes. */
  onState: (state: HearingState) => void;
}

/** Everything one run owns, so the steps below can be plain functions. */
interface Session {
  worker: Worker;
  ambient: { stop(): Promise<void> } | null;
  watch: ReturnType<typeof setInterval> | null;
  memory: HearingMemory;
  /** The last moment the character was observed talking. */
  spokeAt: number;
  stopped: boolean;
}

/**
 * Route what the worker says onto the bus.
 *
 * @param session - The run, for its memory.
 * @param bus - Where the derived events go.
 * @param onState - Where failures go.
 * @param windows - Windows waiting to be scored, in the order they were sent.
 */
function readWorker(
  session: Session,
  bus: Bus,
  onState: (state: HearingState) => void,
  windows: AmbientWindow[],
): void {
  session.worker.onmessage = (event: MessageEvent<FromWorker>) => {
    const message = event.data;
    if (message.type === 'failed') {
      onState({ status: 'failed', message: message.message });
      return;
    }
    if (message.type === 'ready') {
      onState({ status: 'loading' });
      return;
    }
    const window = windows.shift();
    if (!window) return;
    onState({ status: 'listening', db: Math.round(window.db) });
    for (const derived of deriveSound(window, message.heard, session.memory)) bus.publish(derived);
  };
}

/**
 * Open the raw track and start feeding the worker.
 *
 * @param session - Filled in as each step succeeds.
 * @param windows - Where windows are parked until their scores come back.
 * @param onState - Where progress goes.
 */
async function begin(
  session: Session,
  windows: AmbientWindow[],
  onState: (state: HearingState) => void,
): Promise<void> {
  onState({ status: 'starting' });
  session.ambient = await startAmbient((window) => {
    if (session.stopped || overlapsSpeech(session.spokeAt, window.ts)) return;
    // Parked rather than sent along with the samples, because the samples are
    // transferred and would arrive back empty.
    windows.push(window);
    session.worker.postMessage({ type: 'window', samples: window.samples, ts: window.ts }, [
      window.samples.buffer,
    ]);
  });
  if (session.stopped) {
    await session.ambient.stop();
    return;
  }
  session.worker.postMessage({
    type: 'start',
    wasmLoaderPath: new URL(WASM_LOADER, location.href).href,
    wasmBinaryPath: new URL(WASM_BINARY, location.href).href,
    model: MODEL,
    sampleRate: AMBIENT_RATE,
  });
}

/**
 * Start listening to the room.
 *
 * @param options - The bus, the speaking flag, and a state callback.
 * @returns A handle that stops everything. Failures arrive through `onState`
 * rather than as a rejection: a character that cannot open a second microphone
 * track can still hold a conversation, and should.
 */
export function startHearing({ bus, speaking, onState }: HearingOptions): Hearing {
  const session: Session = {
    // Classic, and built outside Vite. See the note above WORKER.
    worker: new Worker(WORKER),
    ambient: null,
    watch: null,
    memory: newHearingMemory(),
    spokeAt: Number.NEGATIVE_INFINITY,
    stopped: false,
  };
  const windows: AmbientWindow[] = [];

  readWorker(session, bus, onState, windows);
  session.worker.onerror = (event) => {
    onState({ status: 'failed', message: event.message || 'the hearing worker stopped' });
  };
  // Sampled rather than subscribed to, so the senses stay ignorant of the voice.
  session.watch = setInterval(() => {
    if (speaking()) session.spokeAt = performance.now();
  }, WATCH_MS);

  void begin(session, windows, onState).catch((error: unknown) => {
    onState({ status: 'failed', message: error instanceof Error ? error.message : String(error) });
  });

  return {
    stop: () => {
      session.stopped = true;
      if (session.watch) clearInterval(session.watch);
      void session.ambient?.stop();
      session.worker.terminate();
      onState({ status: 'off' });
    },
  };
}
