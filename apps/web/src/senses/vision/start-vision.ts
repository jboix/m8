/**
 * Tier 1, wired up: camera to worker to bus. The only module that knows all the
 * pieces exist, and the one place the frame rate is decided.
 */

import type { KnownFace } from '@m8/shared';
import type { Bus } from '../../bus/bus.ts';
import { closeCamera, openCamera } from './camera.ts';
import {
  deriveEvents,
  deriveFaceprint,
  faceToLearn,
  type Learnable,
  newVisionMemory,
  type VisionMemory,
} from './derive.ts';
import type { FromWorker, RecogniserPaths } from './findings.ts';

/**
 * Frames per second sent to the worker. Section 5.2 asks for 10 to 15; the eye
 * renderer wants the rest of the machine.
 */
const RATE_HZ = 12;

/** Width frames are reduced to before they leave the main thread. */
const FRAME_WIDTH = 320;

/**
 * The width while faces are being recognised. The embedder wants the eyes
 * about 35 pixels apart, which a face at arm's length only has in a wider frame.
 */
const RECOGNISING_FRAME_WIDTH = 480;

/**
 * The worker and the wasm runtime, put into `public/` by
 * `scripts/vendor-workers.ts` and served untouched. None of it can go through
 * Vite: the worker has to be a classic script and the loader has to be
 * byte-identical. That script says why.
 */
const WORKER = '/vision/vision.worker.js';
const WASM_LOADER = '/vision/vision_wasm_internal.js';
const WASM_BINARY = '/vision/vision_wasm_internal.wasm';

/** The recogniser's runtime and model, put in the same place by the same script. */
const RECOGNISER_WASM = '/vision/ort-wasm-simd-threaded.wasm';
const RECOGNISER_MODEL = '/vision/facex_nano.onnx';

/** Where the models are fetched from. Cached by the browser after the first run. */
const FACE_MODEL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
const GESTURE_MODEL =
  'https://storage.googleapis.com/mediapipe-tasks/gesture_recognizer/gesture_recognizer.task';

/** What tier 1 is doing. */
export type VisionState =
  | { status: 'starting' }
  | { status: 'loading' }
  | { status: 'running'; fps: number }
  | { status: 'failed'; message: string };

/** A running tier 1. */
export interface Vision {
  /** Turn the camera off and tear the worker down. */
  stop(): void;
  /**
   * Tell him whose faces he knows. Replaces the previous list.
   * @param faces - Every face in his memory.
   */
  setKnownFaces(faces: KnownFace[]): void;
  /**
   * The face in front of him, ready to be learned.
   * @returns Its embedding, or `null` when nobody has been embedded yet, and
   * how many faces are in view.
   */
  faceToLearn(): Learnable;
}

/** How tier 1 is wired. */
export interface VisionOptions {
  /** Where the derived events go. */
  bus: Bus;
  /** Whether to load the recogniser and name faces. */
  knowsFaces: boolean;
  /**
   * Called whenever the state changes, with the camera when there is one. The
   * stream is passed rather than fetched, because the first call happens while
   * `startVision` is still running and has nothing to fetch it from yet.
   */
  onState: (state: VisionState, stream: MediaStream | null) => void;
}

/**
 * Count frames and report a rate about once a second.
 *
 * @param onState - Where the rate goes.
 * @returns A function to call per frame.
 */
function createRateMeter(onState: (state: VisionState) => void): () => void {
  let frames = 0;
  let since = performance.now();
  return () => {
    frames += 1;
    const now = performance.now();
    if (now - since < 1000) return;
    onState({ status: 'running', fps: Math.round((frames * 1000) / (now - since)) });
    frames = 0;
    since = now;
  };
}

/**
 * Route what the worker says onto the bus.
 *
 * @param worker - The worker to listen to.
 * @param bus - Where the derived events go.
 * @param onState - Where the rate and any failure go.
 */
function readWorker(
  worker: Worker,
  bus: Bus,
  memory: VisionMemory,
  onState: (state: VisionState) => void,
): void {
  const counted = createRateMeter(onState);

  worker.onmessage = (event: MessageEvent<FromWorker>) => {
    const message = event.data;
    switch (message.type) {
      case 'failed':
        onState({ status: 'failed', message: message.message });
        return;
      case 'ready':
        // Worth its own state: it separates "the camera will not open" from
        // "the models are still coming down the wire", which look identical otherwise.
        onState({ status: 'loading' });
        return;
      case 'faceprint':
        for (const derived of deriveFaceprint(message.faceprint, memory)) bus.publish(derived);
        return;
      case 'findings':
        counted();
        for (const derived of deriveEvents(message.findings, memory)) bus.publish(derived);
        return;
      default:
        return;
    }
  };
}

/**
 * Put a stream into a playing, hidden video element, which is what
 * `createImageBitmap` needs to read frames from.
 *
 * @param stream - The camera.
 * @returns The element, already playing.
 */
async function playInto(stream: MediaStream): Promise<HTMLVideoElement> {
  const video = document.createElement('video');
  video.srcObject = stream;
  video.muted = true;
  video.playsInline = true;
  await video.play();
  return video;
}

/**
 * Where the wasm and the models are served from, resolved against this page.
 *
 * @param knowsFaces - Whether to include the recogniser.
 * @returns The paths for the worker's start message.
 */
function modelPaths(knowsFaces: boolean) {
  const recogniser: RecogniserPaths | null = knowsFaces
    ? {
        wasmPath: new URL(RECOGNISER_WASM, location.href).href,
        model: new URL(RECOGNISER_MODEL, location.href).href,
      }
    : null;
  return {
    wasmLoaderPath: new URL(WASM_LOADER, location.href).href,
    wasmBinaryPath: new URL(WASM_BINARY, location.href).href,
    faceModel: FACE_MODEL,
    gestureModel: GESTURE_MODEL,
    recogniser,
  };
}

/**
 * Downscale one frame and transfer it to the worker.
 *
 * @param worker - Who gets the frame.
 * @param video - What to read it from.
 * @param width - How wide to make it.
 * @param cancelled - Checked again after the decode, which is asynchronous and
 * can finish after everything has been torn down.
 */
async function handOver(
  worker: Worker,
  video: HTMLVideoElement,
  width: number,
  cancelled: () => boolean,
): Promise<void> {
  const bitmap = await createImageBitmap(video, {
    resizeWidth: width,
    resizeQuality: 'low',
  });
  if (cancelled()) {
    bitmap.close();
    return;
  }
  worker.postMessage({ type: 'frame', bitmap, ts: performance.now() }, [bitmap]);
}

/** Everything one run of tier 1 owns, so the steps below can be plain functions. */
interface Session {
  /** The worker running the models. */
  worker: Worker;
  /** The camera, once it has opened. */
  stream: MediaStream | null;
  /** The element frames are read from. Never in the document. */
  video: HTMLVideoElement | null;
  /** The frame pump. */
  pump: ReturnType<typeof setInterval> | null;
  /** Set by `stop`. Checked after every await, because they all outlive it. */
  stopped: boolean;
  /** Whether the recogniser is loaded. */
  knowsFaces: boolean;
}

/** One tick of the pump, skipping while the camera has nothing to give. */
function pumpFrame(session: Session): void {
  const { video } = session;
  if (!video || session.stopped || video.readyState < 2) return;
  const width = session.knowsFaces ? RECOGNISING_FRAME_WIDTH : FRAME_WIDTH;
  void handOver(session.worker, video, width, () => session.stopped);
}

/**
 * Open the camera, start the models, and begin pumping frames.
 *
 * @param session - Filled in as each step succeeds.
 * @param report - Where progress goes.
 */
async function begin(session: Session, report: (state: VisionState) => void): Promise<void> {
  report({ status: 'starting' });
  session.stream = await openCamera();
  if (session.stopped) return;
  session.video = await playInto(session.stream);
  // Reported again so the preview gets the camera as soon as it exists.
  report({ status: 'starting' });
  session.worker.postMessage({ type: 'start', ...modelPaths(session.knowsFaces) });
  session.pump = setInterval(() => {
    pumpFrame(session);
  }, 1000 / RATE_HZ);
}

/**
 * Stop everything, in the order that turns the camera light off soonest.
 *
 * @param session - The run to end.
 */
function teardown(session: Session): void {
  session.stopped = true;
  if (session.pump) clearInterval(session.pump);
  if (session.stream) closeCamera(session.stream);
  session.video?.remove();
  session.worker.terminate();
}

/**
 * Start tier 1.
 *
 * @param options - The bus to publish to and a state callback.
 * @returns A handle that stops everything. Failures arrive through `onState`
 * rather than as a rejection, because the camera being blocked is a thing the
 * app carries on without.
 */
export function startVision({ bus, onState, knowsFaces }: VisionOptions): Vision {
  const session: Session = {
    // Classic, and built outside Vite. See the note above WORKER.
    worker: new Worker(WORKER),
    stream: null,
    video: null,
    pump: null,
    stopped: false,
    knowsFaces,
  };
  const memory = newVisionMemory();

  /** Report state along with whatever camera is open at the time. */
  const report = (state: VisionState) => {
    onState(state, session.stream);
  };

  readWorker(session.worker, bus, memory, report);
  session.worker.onerror = (event) => {
    report({ status: 'failed', message: event.message || 'the vision worker stopped' });
  };

  void begin(session, report).catch((error: unknown) => {
    report({ status: 'failed', message: error instanceof Error ? error.message : String(error) });
  });

  return {
    stop: () => {
      teardown(session);
    },
    setKnownFaces: (faces) => {
      memory.known = faces;
    },
    faceToLearn: () => faceToLearn(memory),
  };
}
