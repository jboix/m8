/**
 * Everything the character can notice. Section 5.3 of docs/architecture.md.
 *
 * These are the only things that travel on the browser's event bus, and the
 * only things a recording contains, so a session saved today still replays
 * after the modules that produced it have been rewritten.
 */
import { z } from 'zod';

/**
 * A position in the field of view. Normalised 0 to 1 and already mirrored, so
 * a face on the viewer's left arrives with a small `x` and the character can
 * point at it without knowing anything about cameras.
 */
const Normalised = z.number().min(0).max(1);

/** Milliseconds since the page's time origin, from `performance.now`. */
const Timestamp = z.number().nonnegative();

/** A face is where it is, and either turned toward the screen or not. */
const VisionFace = z.object({
  type: z.literal('vision.face'),
  ts: Timestamp,
  id: z.string(),
  x: Normalised,
  y: Normalised,
  size: Normalised,
  facing: z.boolean(),
});

/** A face that was being tracked is gone. */
const VisionFaceLost = z.object({
  type: z.literal('vision.face.lost'),
  ts: Timestamp,
  id: z.string(),
});

/** Something a face did, derived from landmarks without a model. */
const VisionExpression = z.object({
  type: z.literal('vision.expression'),
  ts: Timestamp,
  id: z.string(),
  kind: z.enum(['smile', 'surprise', 'frown', 'talking']),
});

/** A hand did something worth reacting to. */
const VisionGesture = z.object({
  type: z.literal('vision.gesture'),
  ts: Timestamp,
  kind: z.enum(['wave', 'thumbs_up', 'point', 'open_palm']),
});

/** Pixels changed somewhere, with no idea what caused it. */
const VisionMotion = z.object({
  type: z.literal('vision.motion'),
  ts: Timestamp,
  x: Normalised,
  y: Normalised,
  magnitude: Normalised,
});

/** One line from the scene describer, saying what changed. */
const VisionScene = z.object({
  type: z.literal('vision.scene'),
  ts: Timestamp,
  delta: z.string(),
});

/** The ambient sound classifier recognised something. */
const SoundClass = z.object({
  type: z.literal('sound.class'),
  ts: Timestamp,
  label: z.string(),
  confidence: Normalised,
});

/** A bang, without a label. */
const SoundLoud = z.object({
  type: z.literal('sound.loud'),
  ts: Timestamp,
  db: z.number(),
});

/**
 * How a voice sounds right now, about fifteen times a second while somebody is
 * talking. The eyes move with it, so the motion never repeats.
 */
const VoiceLevel = z.object({
  type: z.literal('voice.level'),
  ts: Timestamp,
  /** `self` is the character's own voice at the speaker, `other` is the microphone. */
  who: z.enum(['self', 'other']),
  /** Loudness, 0 silent to 1 loud speech. */
  level: Normalised,
  /** Brightness, 0 dull (vowels, hum) to 1 bright (s, t, hiss). */
  brightness: Normalised,
});

/** The salience filter crossed its threshold and decided what to do about it. */
const SalienceFired = z.object({
  type: z.literal('salience.fired'),
  ts: Timestamp,
  voltage: z.number(),
  causes: z.array(z.string()),
  outcome: z.enum(['note', 'interrupt']),
});

/**
 * Who a face is, as far as the recogniser can tell. Sent when a face is
 * first judged and whenever the judgement changes. `name` is `null` for
 * somebody he does not know by sight.
 */
const VisionPerson = z.object({
  type: z.literal('vision.person'),
  ts: Timestamp,
  id: z.string(),
  name: z.string().nullable(),
  /** How alike the face and its closest known face are, 0 to 1. */
  score: z.number().min(-1).max(1),
});

/** Whether anyone is there at all. Gates the live session. */
const Presence = z.object({
  type: z.literal('presence'),
  ts: Timestamp,
  state: z.enum(['present', 'absent']),
});

/** How the character is feeling. Every value is 0 to 1. */
export const Mood = z.object({
  /** How wound up it is. Rises with events, decays quickly. */
  arousal: Normalised,
  /** How much it wants to look into things. Rises with novelty. */
  curiosity: Normalised,
  /** How little has happened lately. Rises in silence, and lowers the bar. */
  boredom: Normalised,
  /** How well it is going. Rises when someone smiles, falls when ignored. */
  valence: Normalised,
});

/** How the character is feeling. */
export type Mood = z.infer<typeof Mood>;

/**
 * How he is feeling, published a few times a minute so that the session's log
 * ends with the mood he was switched off in.
 */
const MoodReport = z.object({
  type: z.literal('mood'),
  ts: Timestamp,
  mood: Mood,
});

/**
 * How far along he is in being left alone. `looking` when somebody has just
 * gone, then `drowsy`, `dozing` and `asleep` as nobody comes back. A `presence`
 * of `present` ends it.
 */
const Alone = z.object({
  type: z.literal('alone'),
  ts: Timestamp,
  stage: z.enum(['looking', 'drowsy', 'dozing', 'asleep']),
});

/** Anything the character can notice. */
export const SenseEvent = z.discriminatedUnion('type', [
  VisionFace,
  VisionFaceLost,
  VisionPerson,
  VisionExpression,
  VisionGesture,
  VisionMotion,
  VisionScene,
  SoundClass,
  SoundLoud,
  VoiceLevel,
  SalienceFired,
  Presence,
  Alone,
  MoodReport,
]);

/** Anything the character can notice. */
export type SenseEvent = z.infer<typeof SenseEvent>;

/** The `type` of any sense event. */
export type SenseEventType = SenseEvent['type'];

/** The one event a given type names. */
export type SenseEventOf<Type extends SenseEventType> = Extract<SenseEvent, { type: Type }>;

/** Every event type, for filters and for iterating in the debug panel. */
export const SENSE_EVENT_TYPES = SenseEvent.options.map(
  (option) => option.shape.type.value,
) as SenseEventType[];
