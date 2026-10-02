/**
 * The maths of telling faces apart, with no model in it: lining a face up
 * for the embedder, turning pixels into its input, and comparing what it
 * gives back with the faces he knows. Pure, so it is tested without a camera.
 *
 * The embedder is a MobileFaceNet with an ArcFace head. It reads a 112 by 112
 * crop in which the eyes, the nose and the mouth sit where the training data
 * had them, and gives back a unit vector. Two crops of the same person point
 * the same way.
 */

/** A point in pixels. */
export interface Point {
  x: number;
  y: number;
}

/** The five landmarks the alignment is fitted on. */
export interface FacePoints {
  /** The eye on the left of the image. */
  leftEye: Point;
  /** The eye on the right of the image. */
  rightEye: Point;
  /** The tip of the nose. */
  nose: Point;
  /** The corner of the mouth on the left of the image. */
  leftMouth: Point;
  /** The corner of the mouth on the right of the image. */
  rightMouth: Point;
}

/** The side of the crop the embedder reads, in pixels. */
export const CROP_SIZE = 112;

/**
 * Where the five landmarks sit in the crop. This is the ArcFace template
 * every model of this family was trained on, in pixels of a 112 by 112 image.
 */
const TEMPLATE: FacePoints = {
  leftEye: { x: 38.2946, y: 51.6963 },
  rightEye: { x: 73.5318, y: 51.5014 },
  nose: { x: 56.0252, y: 71.7366 },
  leftMouth: { x: 41.5493, y: 92.3655 },
  rightMouth: { x: 70.7299, y: 92.2041 },
};

/** The five, in a fixed order. */
const ORDER = ['leftEye', 'rightEye', 'nose', 'leftMouth', 'rightMouth'] as const;

/**
 * A 2D affine matrix in the order `CanvasRenderingContext2D.setTransform`
 * takes it: `x' = a x + c y + e`, `y' = b x + d y + f`.
 */
export interface Transform {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

/**
 * The mean of some points.
 *
 * @param points - The points.
 * @returns Their centre.
 */
function centre(points: Point[]): Point {
  const sum = points.reduce((acc, point) => ({ x: acc.x + point.x, y: acc.y + point.y }), {
    x: 0,
    y: 0,
  });
  return { x: sum.x / points.length, y: sum.y / points.length };
}

/**
 * The scale and rotation that best carry one set of points onto another, as
 * the first column of the matrix: `a` is the scaled cosine, `b` the scaled sine.
 *
 * @param from - The points to move.
 * @param fromCentre - Their centre.
 * @param to - Where they should land.
 * @param toCentre - That centre.
 * @returns The least-squares scale and rotation.
 */
function rotation(from: Point[], fromCentre: Point, to: Point[], toCentre: Point): Point2 {
  let dot = 0;
  let cross = 0;
  let spread = 0;
  for (const [index, point] of from.entries()) {
    const px = point.x - fromCentre.x;
    const py = point.y - fromCentre.y;
    const target = to[index] ?? toCentre;
    const qx = target.x - toCentre.x;
    const qy = target.y - toCentre.y;
    dot += px * qx + py * qy;
    cross += px * qy - py * qx;
    spread += px * px + py * py;
  }
  const scale = spread > 0 ? Math.hypot(dot, cross) / spread : 1;
  const angle = Math.atan2(cross, dot);
  return { a: scale * Math.cos(angle), b: scale * Math.sin(angle) };
}

/** The first column of a similarity matrix. */
interface Point2 {
  a: number;
  b: number;
}

/**
 * The transform that lays a face over the template: a scale, a rotation and a
 * shift, fitted by least squares over the five points. No shear and no
 * reflection, so a face stays a face.
 *
 * @param points - Where the five landmarks are in the frame, in pixels.
 * @returns The transform to draw the frame with, so the face lands on the crop.
 */
export function alignment(points: FacePoints): Transform {
  const from = ORDER.map((name) => points[name]);
  const to = ORDER.map((name) => TEMPLATE[name]);
  const fromCentre = centre(from);
  const toCentre = centre(to);
  const { a, b } = rotation(from, fromCentre, to, toCentre);
  return {
    a,
    b,
    c: -b,
    d: a,
    e: toCentre.x - (a * fromCentre.x - b * fromCentre.y),
    f: toCentre.y - (b * fromCentre.x + a * fromCentre.y),
  };
}

/**
 * Turn the crop's pixels into the embedder's input: RGB planes, each value
 * scaled from 0 to 255 into -1 to 1, in the NCHW order the model expects.
 *
 * @param rgba - The crop's pixels, four bytes each, row by row.
 * @param mirrored - True to flip the crop left to right while reading it.
 * @returns The tensor's data, `3 * CROP_SIZE * CROP_SIZE` long.
 */
export function toTensor(rgba: Uint8ClampedArray, mirrored = false): Float32Array {
  const plane = CROP_SIZE * CROP_SIZE;
  const data = new Float32Array(3 * plane);
  for (let pixel = 0; pixel < plane; pixel++) {
    const x = pixel % CROP_SIZE;
    const source = pixel - x + (mirrored ? CROP_SIZE - 1 - x : x);
    for (let channel = 0; channel < 3; channel++) {
      data[channel * plane + pixel] = ((rgba[source * 4 + channel] ?? 0) - 127.5) / 128;
    }
  }
  return data;
}

/**
 * Scale a vector to unit length.
 *
 * @param vector - Any vector.
 * @returns The same direction at length 1, or the zero vector unchanged.
 */
export function unit(vector: number[]): number[] {
  const length = Math.hypot(...vector);
  return length > 0 ? vector.map((value) => value / length) : vector;
}

/**
 * The sum of two vectors of the same length.
 *
 * @param a - One.
 * @param b - The other.
 * @returns Their sum.
 */
export function add(a: number[], b: number[]): number[] {
  return a.map((value, index) => value + (b[index] ?? 0));
}

/**
 * How alike two unit vectors are.
 *
 * @param a - One embedding.
 * @param b - Another.
 * @returns Their cosine: 1 the same, 0 unrelated.
 */
export function similarity(a: number[], b: number[]): number {
  let dot = 0;
  for (const [index, value] of a.entries()) dot += value * (b[index] ?? 0);
  return dot;
}

/** Somebody he knows by sight. */
export interface KnownFace {
  /** Their name. */
  name: string;
  /** One embedding of their face. A person can have several. */
  embedding: number[];
}

/** Who a face looks like. */
export interface Match {
  /** Their name. */
  name: string;
  /** How alike, 0 to 1. */
  score: number;
}

/**
 * The known face an embedding is most like.
 *
 * @param embedding - The face in question.
 * @param known - Everybody he knows by sight.
 * @returns The closest name and how close, or `null` when he knows nobody.
 */
export function closest(embedding: number[], known: KnownFace[]): Match | null {
  let best: Match | null = null;
  for (const face of known) {
    const score = similarity(embedding, face.embedding);
    if (!best || score > best.score) best = { name: face.name, score };
  }
  return best;
}
