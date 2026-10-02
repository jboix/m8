/**
 * Tier 1, off the main thread. MediaPipe's face landmarker and gesture
 * recognizer plus frame differencing, on downscaled frames, so the eye renderer
 * keeps its animation frame to itself.
 *
 * Nothing here leaves the browser.
 */
/// <reference lib="webworker" />
import {
  FaceLandmarker,
  type FaceLandmarkerResult,
  GestureRecognizer,
  type GestureRecognizerResult,
  type NormalizedLandmark,
} from '@mediapipe/tasks-vision';
import { createEmbedder, type Embedder, type EmbedRequest } from './embedder.ts';
import type { FaceFinding, Findings, FromWorker, StartMessage, ToWorker } from './findings.ts';
import { createMotionDetector, MOTION_CELLS } from './motion.ts';
import { assignTracks, newTracking } from './tracks.ts';

/** MediaPipe's nose tip, which is the steadiest point on a moving face. */
const NOSE = 1;
/** The outer corner of each eye, for guessing how square-on the face is. */
const LEFT_EYE = 33;
const RIGHT_EYE = 263;

/**
 * How many faces the landmarker looks for. Three covers a couple beside the
 * person holding the phone; each one costs a landmark pass per frame.
 */
const MAX_FACES = 3;

const detector = createMotionDetector();
const tracking = newTracking();
let landmarker: FaceLandmarker | null = null;
let recognizer: GestureRecognizer | null = null;
let embedder: Embedder | null = null;
let grid: OffscreenCanvas | null = null;

/**
 * The last timestamp handed to MediaPipe. In VIDEO mode it rejects a frame that
 * is not strictly later than the one before, and frames can arrive out of order
 * because the main thread decodes them asynchronously.
 */
let lastTs = 0;

/**
 * Tell the main thread something.
 *
 * @param message - What to say.
 */
function send(message: FromWorker): void {
  self.postMessage(message);
}

/**
 * Load both models.
 *
 * @param start - Where the wasm and the models are served from.
 */
async function load(start: StartMessage): Promise<void> {
  const fileset = {
    wasmLoaderPath: start.wasmLoaderPath,
    wasmBinaryPath: start.wasmBinaryPath,
  };
  landmarker = await FaceLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: start.faceModel },
    runningMode: 'VIDEO',
    numFaces: MAX_FACES,
    outputFaceBlendshapes: true,
  });
  recognizer = await GestureRecognizer.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: start.gestureModel },
    runningMode: 'VIDEO',
    numHands: 1,
  });
  embedder = start.recogniser
    ? await createEmbedder({
        paths: start.recogniser,
        onFailed: (message) => {
          send({ type: 'failed', message });
        },
      })
    : null;
}

/**
 * Reduce a frame to one brightness per cell, for frame differencing.
 *
 * @param bitmap - The frame.
 * @returns The grid, row major.
 */
function luma(bitmap: ImageBitmap): Uint8ClampedArray {
  grid ??= new OffscreenCanvas(MOTION_CELLS, MOTION_CELLS);
  const context = grid.getContext('2d', { willReadFrequently: true });
  if (!context) return new Uint8ClampedArray(MOTION_CELLS * MOTION_CELLS);
  context.drawImage(bitmap, 0, 0, MOTION_CELLS, MOTION_CELLS);
  const { data } = context.getImageData(0, 0, MOTION_CELLS, MOTION_CELLS);
  const cells = new Uint8ClampedArray(MOTION_CELLS * MOTION_CELLS);
  for (let cell = 0; cell < cells.length; cell++) {
    const at = cell * 4;
    cells[cell] = ((data[at] ?? 0) * 3 + (data[at + 1] ?? 0) * 6 + (data[at + 2] ?? 0)) / 10;
  }
  return cells;
}

/** A face as read off the landmarks, before it has an id. */
type Sighted = Omit<FaceFinding, 'id'>;

/**
 * Turn one face's landmarks into a sighting.
 *
 * @param result - What the landmarker returned.
 * @param index - Which of its faces.
 * @returns The face, or `null` when the landmarks are incomplete.
 */
function readFace(result: FaceLandmarkerResult, index: number): Sighted | null {
  const points = result.faceLandmarks[index];
  const nose = points?.[NOSE];
  const left = points?.[LEFT_EYE];
  const right = points?.[RIGHT_EYE];
  if (!points || !nose || !left || !right) return null;

  const ys = points.map((point) => point.y);
  // A face square-on has the nose midway between the eye corners. The further
  // it sits from the middle, the further the head has turned.
  const span = Math.abs(right.x - left.x) || 1;
  const offset = Math.abs((nose.x - (left.x + right.x) / 2) / span);

  return {
    x: 1 - nose.x,
    y: nose.y,
    size: Math.min(1, Math.max(...ys) - Math.min(...ys)),
    facing: Math.max(0, 1 - offset * 4),
    blendshapes: (result.faceBlendshapes[index]?.categories ?? []).map((category) => ({
      name: category.categoryName,
      score: category.score,
    })),
  };
}

/** A face with its id, and the landmarks the recogniser lines it up with. */
interface Found {
  /** What the main thread gets. */
  finding: FaceFinding;
  /** What the recogniser needs. */
  request: EmbedRequest;
}

/**
 * Turn a landmark result into face findings with ids, largest first.
 *
 * @param result - What the landmarker returned.
 * @param ts - The frame's time, for the tracker.
 * @returns Every face it found.
 */
function readFaces(result: FaceLandmarkerResult, ts: number): Found[] {
  const sighted = result.faceLandmarks
    .map((landmarks, index) => ({ landmarks, face: readFace(result, index) }))
    .filter(
      (entry): entry is { landmarks: NormalizedLandmark[]; face: Sighted } => entry.face !== null,
    );
  const ids = assignTracks(
    tracking,
    sighted.map((entry) => entry.face),
    ts,
  );
  return sighted
    .map(({ landmarks, face }, index) => {
      const id = ids[index] ?? `f${index}`;
      return {
        finding: { id, ...face },
        request: { id, landmarks, facing: face.facing, size: face.size },
      };
    })
    .sort((a, b) => b.finding.size - a.finding.size);
}

/**
 * Turn a gesture result into a name and a place.
 *
 * @param result - What the recognizer returned.
 * @returns The gesture and the hand, both `null` when it saw no hand.
 */
function readGesture(result: GestureRecognizerResult): Pick<Findings, 'gesture' | 'hand'> {
  const name = result.gestures[0]?.[0]?.categoryName;
  const wrist = result.landmarks[0]?.[0];
  if (!name || name === 'None' || !wrist) return { gesture: null, hand: null };
  return { gesture: name, hand: { x: 1 - wrist.x, y: wrist.y } };
}

/**
 * Run both models and the differencer over one frame.
 *
 * @param bitmap - The frame. Closed before this returns.
 * @param ts - When it was captured.
 */
function process(bitmap: ImageBitmap, ts: number): void {
  if (!landmarker || !recognizer) {
    bitmap.close();
    return;
  }
  const at = Math.max(ts, lastTs + 1);
  lastTs = at;
  try {
    const motion = detector.compare(luma(bitmap));
    const found = readFaces(landmarker.detectForVideo(bitmap, at), ts);
    const gesture = readGesture(recognizer.recognizeForVideo(bitmap, at));
    const faces = found.map((entry) => entry.finding);
    send({ type: 'findings', findings: { ts, faces, motion, ...gesture } });
    embedder?.embed(
      found.map((entry) => entry.request),
      bitmap,
      ts,
      (id, embedding) => {
        send({ type: 'faceprint', faceprint: { id, ts, embedding } });
      },
    );
  } catch (error) {
    // A throw in here would otherwise take the whole worker down silently, and
    // the symptom is a camera light that is on while nothing ever happens.
    send({ type: 'failed', message: `frame: ${String(error)}` });
  } finally {
    bitmap.close();
  }
}

self.onmessage = async (event: MessageEvent<ToWorker>) => {
  const message = event.data;
  if (message.type === 'frame') {
    process(message.bitmap, message.ts);
    return;
  }
  try {
    await load(message);
    send({ type: 'ready' });
  } catch (error) {
    // MediaPipe's failures here are one line with no context, and the context
    // is the whole diagnosis: whether this is a classic worker at all, and what
    // it was pointed at.
    const kind = typeof (self as { importScripts?: unknown }).importScripts;
    send({
      type: 'failed',
      message: `${String(error)} [importScripts: ${kind}, factory: ${typeof (self as { ModuleFactory?: unknown }).ModuleFactory}, loader: ${message.wasmLoaderPath}]`,
    });
  }
};
