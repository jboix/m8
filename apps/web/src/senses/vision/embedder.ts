/**
 * The recogniser inside the vision worker: lines a face up on the template,
 * runs the embedding model on it, and hands back a unit vector. One face at a
 * time, off the main thread, and never more often than the cadence allows.
 *
 * Nothing here leaves the browser. The embedding goes to the main thread,
 * which compares it with the faces he knows.
 */
/// <reference lib="webworker" />
import type { NormalizedLandmark } from '@mediapipe/tasks-vision';
import * as ort from 'onnxruntime-web/wasm';
import type { RecogniserPaths } from './findings.ts';
import { add, alignment, CROP_SIZE, type FacePoints, toTensor, unit } from './recognise.ts';

/** MediaPipe's iris centres, one per eye. Which is which is settled by position. */
const IRISES = [468, 473];
/** MediaPipe's mouth corners. */
const MOUTH_CORNERS = [61, 291];
/** MediaPipe's nose tip. */
const NOSE = 1;

/** How often one face is embedded. Recognition needs no more than this. */
const EMBED_EVERY_MS = 2000;

/**
 * How square-on a face must be for its embedding to be worth anything. The
 * facing score falls to 0 at about thirty degrees of turn, and the model copes
 * with a face turned that far, so this only refuses a profile.
 */
const FACING_FLOOR = 0.05;

/**
 * How tall a face must be in the frame, in pixels. The crop puts the eyes 35
 * pixels apart, which a face this tall roughly has; below it the crop is an
 * upscaled blur. In pixels, not as a share of the frame: a phone held upright
 * sends a tall frame, and the same face is a smaller share of it.
 */
const MIN_FACE_PX = 64;

/** A face the caller wants embedded. */
export interface EmbedRequest {
  /** Its track. */
  id: string;
  /** Its landmarks, normalised to the bitmap. */
  landmarks: NormalizedLandmark[];
  /** How square-on it is. */
  facing: number;
  /** How tall it is, as a share of the frame. */
  size: number;
}

/** The running recogniser. */
export interface Embedder {
  /**
   * Embed whichever of these faces is due, at most one per call.
   * @param faces - The faces in this frame.
   * @param bitmap - The frame. Read before this returns; the caller closes it.
   * @param ts - The frame's time.
   * @param report - Called with the embedding once the model has run.
   */
  embed(
    faces: EmbedRequest[],
    bitmap: ImageBitmap,
    ts: number,
    report: (id: string, embedding: number[]) => void,
  ): void;
}

/** How the recogniser is set up. */
export interface EmbedderOptions {
  /** Where the runtime and the model are served from. */
  paths: RecogniserPaths;
  /**
   * Called when the model throws. The frame loop goes on without a face.
   * @param message - What went wrong.
   */
  onFailed: (message: string) => void;
}

/**
 * Pick the five alignment points out of the landmarks, by position rather
 * than by MediaPipe's naming, so a mirrored frame cannot swap the eyes.
 *
 * @param landmarks - All 478, normalised.
 * @param width - The bitmap's width in pixels.
 * @param height - Its height.
 * @returns The five points in pixels, or `null` when one is missing.
 */
function facePoints(
  landmarks: NormalizedLandmark[],
  width: number,
  height: number,
): FacePoints | null {
  const pixel = (index: number) => {
    const point = landmarks[index];
    return point ? { x: point.x * width, y: point.y * height } : null;
  };
  const eyes = IRISES.map(pixel);
  const mouth = MOUTH_CORNERS.map(pixel);
  const nose = pixel(NOSE);
  const [eyeA, eyeB] = eyes;
  const [mouthA, mouthB] = mouth;
  if (!eyeA || !eyeB || !mouthA || !mouthB || !nose) return null;
  const [leftEye, rightEye] = eyeA.x <= eyeB.x ? [eyeA, eyeB] : [eyeB, eyeA];
  const [leftMouth, rightMouth] = mouthA.x <= mouthB.x ? [mouthA, mouthB] : [mouthB, mouthA];
  return { leftEye, rightEye, nose, leftMouth, rightMouth };
}

/** The model, and what to call its input and output. */
interface Model {
  /** The session. */
  session: ort.InferenceSession;
  /** The input's name. */
  input: string;
  /** The output's name. */
  output: string;
}

/**
 * Run the model on a crop and its mirror image, and average the two. The
 * mirror costs a second run and makes the embedding steadier.
 *
 * @param model - The model.
 * @param rgba - The crop's pixels.
 * @returns The unit embedding.
 */
async function runModel(model: Model, rgba: Uint8ClampedArray): Promise<number[]> {
  const shape = [1, 3, CROP_SIZE, CROP_SIZE];
  const feed = (mirrored: boolean) => ({
    [model.input]: new ort.Tensor('float32', toTensor(rgba, mirrored), shape),
  });
  const plain = await model.session.run(feed(false));
  const flipped = await model.session.run(feed(true));
  const a = Array.from(plain[model.output]?.data as Float32Array);
  const b = Array.from(flipped[model.output]?.data as Float32Array);
  return unit(add(a, b));
}

/**
 * Draw a face onto the crop, lined up with the template.
 *
 * @param context - The crop's canvas.
 * @param bitmap - The frame.
 * @param points - Where the face's five landmarks are in the frame.
 * @returns The crop's pixels.
 */
function cropFace(
  context: OffscreenCanvasRenderingContext2D,
  bitmap: ImageBitmap,
  points: FacePoints,
): Uint8ClampedArray {
  const { a, b, c, d, e, f } = alignment(points);
  context.setTransform(a, b, c, d, e, f);
  context.drawImage(bitmap, 0, 0);
  return context.getImageData(0, 0, CROP_SIZE, CROP_SIZE).data;
}

/**
 * The face to embed this frame: the first one that is due and good enough.
 *
 * @param faces - The faces in this frame.
 * @param dueAt - When each track is next due. Tracks no longer in view are dropped.
 * @param ts - The frame's time.
 * @param height - The frame's height in pixels, which the size is a share of.
 * @returns The face, or `null`.
 */
function pickDue(
  faces: EmbedRequest[],
  dueAt: Map<string, number>,
  ts: number,
  height: number,
): EmbedRequest | null {
  for (const id of dueAt.keys()) {
    if (!faces.some((face) => face.id === id)) dueAt.delete(id);
  }
  const good = (face: EmbedRequest) =>
    face.facing >= FACING_FLOOR && face.size * height >= MIN_FACE_PX;
  const due = (face: EmbedRequest) => ts >= (dueAt.get(face.id) ?? Number.NEGATIVE_INFINITY);
  return faces.find((face) => good(face) && due(face)) ?? null;
}

/**
 * Load the model.
 *
 * @param options - Where the runtime and the model are, and where failures go.
 * @returns The recogniser, ready to embed.
 */
export async function createEmbedder({ paths, onFailed }: EmbedderOptions): Promise<Embedder> {
  // Naming the binary alone keeps the runtime on its bundled loader. A path
  // prefix would make it `import()` the loader instead, which a classic
  // worker cannot do.
  ort.env.wasm.wasmPaths = { wasm: paths.wasmPath };
  // One thread: more needs cross-origin isolation, and one is plenty here.
  ort.env.wasm.numThreads = 1;
  const session = await ort.InferenceSession.create(paths.model, { executionProviders: ['wasm'] });
  const [input = 'input'] = session.inputNames;
  const [output = 'embedding'] = session.outputNames;
  const model: Model = { session, input, output };
  const context = new OffscreenCanvas(CROP_SIZE, CROP_SIZE).getContext('2d', {
    willReadFrequently: true,
  });
  const dueAt = new Map<string, number>();
  let busy = false;

  return {
    embed(faces, bitmap, ts, report) {
      if (busy || !context) return;
      const face = pickDue(faces, dueAt, ts, bitmap.height);
      const points = face && facePoints(face.landmarks, bitmap.width, bitmap.height);
      if (!face || !points) return;
      dueAt.set(face.id, ts + EMBED_EVERY_MS);
      busy = true;
      runModel(model, cropFace(context, bitmap, points))
        .then((embedding) => {
          report(face.id, embedding);
        })
        .catch((error: unknown) => {
          onFailed(`embedding: ${String(error)}`);
        })
        .finally(() => {
          busy = false;
        });
    },
  };
}
