/**
 * Turns what the worker saw into what the character notices. All of it is pure,
 * which is the only reason tier 1 can be tested without sitting in front of a
 * camera.
 *
 * Section 5.2: this derives face, presence, expression and gesture, and none of
 * it involves a model.
 */
import type { KnownFace, SenseEvent } from '@m8/shared';
import type { Blendshape, Faceprint, Findings } from './findings.ts';
import { add, closest, unit } from './recognise.ts';

/** How long a face may go unseen before it counts as lost. */
const FACE_GRACE_MS = 700;

/** How long nobody may be there before the character is alone. */
const ABSENT_AFTER_MS = 4000;

/**
 * How long nobody may be there before each stage of being left alone, in
 * order. He looks for them first, and only then starts to nod off.
 */
const ALONE_STAGES = [
  { stage: 'looking', afterMs: ABSENT_AFTER_MS },
  { stage: 'drowsy', afterMs: 18_000 },
  { stage: 'dozing', afterMs: 32_000 },
  { stage: 'asleep', afterMs: 46_000 },
] as const;

/** How square-on a face must be to count as looking at the screen. */
const FACING_FLOOR = 0.62;

/** How hard a blendshape must fire to be called an expression. */
const EXPRESSION_FLOOR = 0.4;

/** How long before the same expression is reported again. */
const EXPRESSION_GAP_MS = 1500;

/** How far a hand must travel sideways, normalised, to have waved. */
const WAVE_REACH = 0.12;

/** How long a wave may take. */
const WAVE_WINDOW_MS = 1400;

/**
 * How alike a face and a known face must be to be the same person. Below it
 * he says he does not know them, which is the safer mistake: calling somebody
 * by the wrong name is what this whole thing is for.
 */
const MATCH_FLOOR = 0.45;

/** How many recent embeddings of one face are averaged before it is judged. */
const PRINTS_KEPT = 5;

/** One face still considered present. */
interface FaceSeen {
  /** When it was last seen. */
  seenAt: number;
  /** How tall it was, as a share of the frame. */
  size: number;
}

/** What the deriver remembers between frames. */
export interface VisionMemory {
  /** When any face was last seen. Negative infinity until one has been. */
  faceAt: number;
  /** Each face still considered present, by track id. */
  faces: Map<string, FaceSeen>;
  /** The faces he knows. Set from outside; empty until the memory answers. */
  known: KnownFace[];
  /** The recent embeddings of each face in view, oldest first. */
  prints: Map<string, number[][]>;
  /** Who each face in view was last judged to be. Absent until judged. */
  judged: Map<string, string | null>;
  /** Whether the character currently believes someone is there. */
  present: boolean;
  /** How many of the stages of being left alone have been reported since somebody left. */
  aloneStages: number;
  /** When each expression was last reported, by face and kind. */
  saidAt: Map<string, number>;
  /** Recent open-palm sightings, for spotting a wave. */
  palms: { x: number; ts: number }[];
}

/**
 * A fresh memory.
 *
 * @returns Memory with nobody in it.
 */
export function newVisionMemory(): VisionMemory {
  // Not 0: on a page that has just loaded, `ts` is also near 0, and "last seen
  // at zero" would read as someone standing there.
  return {
    faceAt: Number.NEGATIVE_INFINITY,
    faces: new Map(),
    known: [],
    prints: new Map(),
    judged: new Map(),
    present: false,
    aloneStages: 0,
    saidAt: new Map(),
    palms: [],
  };
}

/**
 * The strongest of a set of blendshapes.
 *
 * @param shapes - Every blendshape for the frame.
 * @param names - The ones to consider.
 * @returns The highest score among them, or 0.
 */
function peak(shapes: Blendshape[], names: string[]): number {
  let best = 0;
  for (const shape of shapes) {
    if (names.includes(shape.name) && shape.score > best) best = shape.score;
  }
  return best;
}

/** Which blendshapes stand for which expression, strongest claim first. */
const EXPRESSIONS: { kind: 'smile' | 'surprise' | 'frown' | 'talking'; shapes: string[] }[] = [
  { kind: 'smile', shapes: ['mouthSmileLeft', 'mouthSmileRight'] },
  { kind: 'surprise', shapes: ['browInnerUp', 'eyeWideLeft', 'eyeWideRight'] },
  { kind: 'frown', shapes: ['browDownLeft', 'browDownRight', 'mouthFrownLeft', 'mouthFrownRight'] },
  { kind: 'talking', shapes: ['jawOpen'] },
];

/** MediaPipe's canned gestures, in the vocabulary of the tool registry. */
const GESTURES: Record<string, 'thumbs_up' | 'point' | 'open_palm'> = {
  Thumb_Up: 'thumbs_up',
  Pointing_Up: 'point',
  Open_Palm: 'open_palm',
};

/**
 * The expression a face is wearing, if it is wearing one clearly.
 *
 * @param shapes - The frame's blendshapes.
 * @returns The expression, or `null`.
 */
function expressionOf(shapes: Blendshape[]): 'smile' | 'surprise' | 'frown' | 'talking' | null {
  for (const candidate of EXPRESSIONS) {
    if (peak(shapes, candidate.shapes) >= EXPRESSION_FLOOR) return candidate.kind;
  }
  return null;
}

/**
 * Whether a run of open palms crossed far enough sideways to be a wave.
 *
 * @param palms - Recent sightings, oldest first.
 * @returns True when the hand covered enough ground inside the window.
 */
function isWave(palms: { x: number; ts: number }[]): boolean {
  if (palms.length < 3) return false;
  const xs = palms.map((palm) => palm.x);
  return Math.max(...xs) - Math.min(...xs) >= WAVE_REACH;
}

/**
 * Face events for one frame, and the loss of every face that stopped arriving.
 *
 * @param findings - What the worker saw.
 * @param memory - Mutated in place.
 * @returns The events this frame produced.
 */
function deriveFace(findings: Findings, memory: VisionMemory): SenseEvent[] {
  const { ts, faces } = findings;
  const events: SenseEvent[] = [];
  for (const face of faces) {
    memory.faceAt = ts;
    memory.faces.set(face.id, { seenAt: ts, size: face.size });
    events.push({
      type: 'vision.face',
      ts,
      id: face.id,
      x: face.x,
      y: face.y,
      size: face.size,
      facing: face.facing >= FACING_FLOOR,
    });
  }
  for (const [id, seen] of memory.faces) {
    if (ts - seen.seenAt <= FACE_GRACE_MS) continue;
    memory.faces.delete(id);
    memory.prints.delete(id);
    memory.judged.delete(id);
    events.push({ type: 'vision.face.lost', ts, id });
  }
  return events;
}

/**
 * Presence, which gates the live session and makes the character doze off.
 *
 * @param ts - The frame's timestamp.
 * @param memory - Mutated in place.
 * @returns A presence event when the answer changed, otherwise nothing.
 */
function derivePresence(ts: number, memory: VisionMemory): SenseEvent[] {
  const here = memory.faces.size > 0 || ts - memory.faceAt <= ABSENT_AFTER_MS;
  if (here === memory.present) return [];
  memory.present = here;
  return [{ type: 'presence', ts, state: here ? 'present' : 'absent' }];
}

/**
 * The stages of being left alone, each reported once as the time since the
 * last face passes it.
 *
 * @param ts - The frame's timestamp.
 * @param memory - Mutated in place.
 * @returns An `alone` event for each stage newly reached. Nothing while
 * somebody is there, and nothing before anybody ever was.
 */
function deriveAlone(ts: number, memory: VisionMemory): SenseEvent[] {
  if (memory.present) {
    memory.aloneStages = 0;
    return [];
  }
  const reached = ALONE_STAGES.filter(({ afterMs }) => ts - memory.faceAt > afterMs);
  if (!Number.isFinite(memory.faceAt) || reached.length <= memory.aloneStages) return [];

  const fresh = reached.slice(memory.aloneStages);
  memory.aloneStages = reached.length;
  return fresh.map(({ stage }) => ({ type: 'alone', ts, stage }));
}

/**
 * Expression events, rate limited so a held smile is reported once rather than
 * fifteen times a second.
 *
 * @param findings - What the worker saw.
 * @param memory - Mutated in place.
 * @returns The event, or nothing.
 */
function deriveExpression(findings: Findings, memory: VisionMemory): SenseEvent[] {
  const { ts, faces } = findings;
  const events: SenseEvent[] = [];
  for (const face of faces) {
    const kind = expressionOf(face.blendshapes);
    if (!kind) continue;
    const key = `${face.id}:${kind}`;
    if (ts - (memory.saidAt.get(key) ?? -Infinity) < EXPRESSION_GAP_MS) continue;
    memory.saidAt.set(key, ts);
    events.push({ type: 'vision.expression', ts, id: face.id, kind });
  }
  return events;
}

/**
 * Gesture events, including the wave, which MediaPipe does not recognise: it is
 * an open palm that has been moving sideways.
 *
 * @param findings - What the worker saw.
 * @param memory - Mutated in place.
 * @returns The event, or nothing.
 */
function deriveGesture(findings: Findings, memory: VisionMemory): SenseEvent[] {
  const { ts, gesture, hand } = findings;
  memory.palms = memory.palms.filter((palm) => ts - palm.ts <= WAVE_WINDOW_MS);
  if (!gesture) return [];

  if (gesture === 'Open_Palm' && hand) {
    memory.palms.push({ x: hand.x, ts });
    if (!isWave(memory.palms)) return [{ type: 'vision.gesture', ts, kind: 'open_palm' }];
    memory.palms = [];
    return [{ type: 'vision.gesture', ts, kind: 'wave' }];
  }

  const kind = GESTURES[gesture];
  return kind ? [{ type: 'vision.gesture', ts, kind }] : [];
}

/**
 * Motion events, from frame differencing rather than from any model.
 *
 * @param findings - What the worker saw.
 * @returns The event, or nothing.
 */
function deriveMotion(findings: Findings): SenseEvent[] {
  const { ts, motion } = findings;
  if (!motion || motion.magnitude <= 0) return [];
  return [{ type: 'vision.motion', ts, x: motion.x, y: motion.y, magnitude: motion.magnitude }];
}

/**
 * Everything one frame is worth saying.
 *
 * @param findings - What the worker saw.
 * @param memory - Carried between frames. Mutated in place.
 * @returns The events to publish, in the order they should arrive.
 */
export function deriveEvents(findings: Findings, memory: VisionMemory): SenseEvent[] {
  return [
    ...deriveFace(findings, memory),
    ...derivePresence(findings.ts, memory),
    ...deriveAlone(findings.ts, memory),
    ...deriveExpression(findings, memory),
    ...deriveGesture(findings, memory),
    ...deriveMotion(findings),
  ];
}

/**
 * The average of a face's recent embeddings, as a unit vector.
 *
 * @param prints - The embeddings.
 * @returns Their mean direction, or `null` when there are none.
 */
function meanPrint(prints: number[][]): number[] | null {
  const [first, ...rest] = prints;
  return first ? unit(rest.reduce(add, first)) : null;
}

/**
 * Who a face is, given one more embedding of it. Recent embeddings are
 * averaged, so a single bad frame cannot rename somebody.
 *
 * @param faceprint - The embedding, from the worker.
 * @param memory - Mutated in place.
 * @returns A `vision.person` event when the judgement is new or changed.
 */
export function deriveFaceprint(faceprint: Faceprint, memory: VisionMemory): SenseEvent[] {
  const { id, ts } = faceprint;
  if (!memory.faces.has(id)) return [];
  const prints = [...(memory.prints.get(id) ?? []), faceprint.embedding].slice(-PRINTS_KEPT);
  memory.prints.set(id, prints);

  const mean = meanPrint(prints);
  const match = mean ? closest(mean, memory.known) : null;
  const name = match && match.score >= MATCH_FLOOR ? match.name : null;
  if (memory.judged.has(id) && memory.judged.get(id) === name) return [];
  memory.judged.set(id, name);
  return [{ type: 'vision.person', ts, id, name, score: match?.score ?? 0 }];
}

/** What there is to learn right now. */
export interface Learnable {
  /** The largest embedded face in view, averaged over its recent embeddings, or `null`. */
  embedding: number[] | null;
  /** How many faces are in view, embedded or not. */
  inView: number;
}

/**
 * The face to learn a name for: the largest one in view that has been
 * embedded, averaged over its recent embeddings.
 *
 * @param memory - What the deriver remembers.
 * @returns The embedding, or `null` when nobody is there to learn, and how
 * many faces are in view, so the caller can say which of the two it was.
 */
export function faceToLearn(memory: VisionMemory): Learnable {
  const candidates = [...memory.faces.entries()]
    .filter(([id]) => (memory.prints.get(id)?.length ?? 0) > 0)
    .sort(([, a], [, b]) => b.size - a.size);
  const [best] = candidates;
  return {
    embedding: best ? meanPrint(memory.prints.get(best[0]) ?? []) : null,
    inView: memory.faces.size,
  };
}
