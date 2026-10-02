/**
 * The ambient sound classifier, off the main thread.
 *
 * YAMNet over AudioSet's five hundred and twenty-one classes, on one-second
 * windows of the raw microphone track. It says what kind of sound a window was;
 * deciding whether that is worth mentioning happens on the main thread, in
 * `derive-sound.ts`.
 *
 * Built outside Vite and served from `public/`: MediaPipe loads its wasm with
 * `importScripts`, which needs a classic worker, and Vite's dev server only
 * serves module workers. Nothing here leaves the browser.
 */
/// <reference lib="webworker" />
import { AudioClassifier } from '@mediapipe/tasks-audio';
import type { Heard } from './derive-sound.ts';
import type { FromWorker, StartMessage, ToWorker, WindowMessage } from './hearing-protocol.ts';

/**
 * How many classes to keep per window. The whitelist throws most of them away,
 * so a handful is enough to find the one thing the character has a word for.
 */
const MAX_RESULTS = 8;

/** Below this nothing is kept. `derive-sound.ts` applies the real floor. */
const SCORE_THRESHOLD = 0.15;

let classifier: AudioClassifier | null = null;
let rate = 16_000;

/**
 * Tell the main thread something.
 *
 * @param message - What to say.
 */
function send(message: FromWorker): void {
  self.postMessage(message);
}

/**
 * Load YAMNet.
 *
 * @param start - Where the wasm and the model are served from.
 */
async function load(start: StartMessage): Promise<void> {
  rate = start.sampleRate;
  classifier = await AudioClassifier.createFromOptions(
    { wasmLoaderPath: start.wasmLoaderPath, wasmBinaryPath: start.wasmBinaryPath },
    {
      baseOptions: { modelAssetPath: start.model },
      maxResults: MAX_RESULTS,
      scoreThreshold: SCORE_THRESHOLD,
    },
  );
}

/**
 * Score one window.
 *
 * @param message - The samples and when they ended.
 */
function classify(message: WindowMessage): void {
  if (!classifier) return;
  const heard: Heard[] = [];
  // One window is one result, but the API returns a list because it also takes
  // whole clips. Flattened rather than assumed.
  for (const result of classifier.classify(message.samples, rate)) {
    for (const category of result.classifications[0]?.categories ?? []) {
      if (category.categoryName)
        heard.push({ label: category.categoryName, score: category.score });
    }
  }
  send({ type: 'heard', heard, ts: message.ts });
}

self.onmessage = async (event: MessageEvent<ToWorker>) => {
  const message = event.data;
  try {
    if (message.type === 'start') {
      await load(message);
      send({ type: 'ready' });
      return;
    }
    classify(message);
  } catch (error) {
    // A throw that escapes here takes the worker down, and a dead worker looks
    // exactly like a quiet room.
    send({ type: 'failed', message: error instanceof Error ? error.message : String(error) });
  }
};
