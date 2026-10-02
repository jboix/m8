/**
 * What the worker reports for one frame, and the message protocol around it.
 *
 * This is a boundary, but not one `packages/shared` covers: both sides ship in
 * the same bundle, and the frames going the other way are `ImageBitmap`s, which
 * no schema can describe. The contracts it produces, the sense events, are the
 * ones that travel.
 */

/** One blendshape score, 0 to 1. MediaPipe emits 52 of them per face. */
export interface Blendshape {
  /** Its name, such as `mouthSmileLeft`. */
  name: string;
  /** How strongly it is firing. */
  score: number;
}

/** A face the worker saw. */
export interface FaceFinding {
  /** The track it belongs to. The same person keeps the same id from frame to frame. */
  id: string;
  /** Centre of the face, normalised and already mirrored. */
  x: number;
  /** Vertical centre, normalised. */
  y: number;
  /** Height of the face box as a fraction of the frame. */
  size: number;
  /** How square-on the face is, 0 turned away to 1 straight at the screen. */
  facing: number;
  /** The expression scores, in MediaPipe's order. */
  blendshapes: Blendshape[];
}

/** What one frame produced. */
export interface Findings {
  /** When the frame was captured, on the page's clock. */
  ts: number;
  /** Every face found, largest first. Empty when there is none. */
  faces: FaceFinding[];
  /** The recognised hand gesture, in MediaPipe's vocabulary, or `null`. */
  gesture: string | null;
  /** Where the hand is, normalised and mirrored. Only set with a gesture. */
  hand: { x: number; y: number } | null;
  /** How much the frame changed, 0 to 1, and where. */
  motion: { x: number; y: number; magnitude: number } | null;
}

/** What the recogniser needs, both served by us. */
export interface RecogniserPaths {
  /** The ONNX runtime's wasm binary. */
  wasmPath: string;
  /** The face embedding model. */
  model: string;
}

/** Sent to the worker to start it. */
export interface StartMessage {
  type: 'start';
  /** Where the MediaPipe wasm loader lives, served by us. */
  wasmLoaderPath: string;
  /** Where its binary lives. */
  wasmBinaryPath: string;
  /** The face landmarker model. */
  faceModel: string;
  /** The gesture recognizer model. */
  gestureModel: string;
  /** The recogniser, or `null` to leave faces unnamed. */
  recogniser: RecogniserPaths | null;
}

/** An embedding of one face, from the recogniser. */
export interface Faceprint {
  /** The track it was taken from. */
  id: string;
  /** When the frame it came from was captured. */
  ts: number;
  /** The unit vector the model gave. */
  embedding: number[];
}

/** Sent to the worker for every frame. The bitmap is transferred, not copied. */
export interface FrameMessage {
  type: 'frame';
  /** The frame, already downscaled. The worker closes it. */
  bitmap: ImageBitmap;
  /** When it was captured. */
  ts: number;
}

/** Anything the main thread sends the worker. */
export type ToWorker = StartMessage | FrameMessage;

/** Anything the worker sends back. */
export type FromWorker =
  | { type: 'ready' }
  | { type: 'findings'; findings: Findings }
  | { type: 'faceprint'; faceprint: Faceprint }
  | { type: 'failed'; message: string };
