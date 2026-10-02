/**
 * The tool registry and the vocabularies it is built from. Section 7.3 of
 * docs/architecture.md.
 */
import { z } from 'zod';

/**
 * Where the character can be asked to look. Targets are semantic, never
 * coordinates: the gaze arbiter resolves one to a live point every frame, so a
 * target stays valid while the thing it names moves.
 */
export const GazeTarget = z.enum([
  'speaker',
  'nearest_face',
  'motion',
  'away',
  'up_thinking',
  'down',
  'around',
]);

/** A semantic gaze target. */
export type GazeTarget = z.infer<typeof GazeTarget>;

/**
 * The character's expressions. There is no mouth and no face outline, so every
 * one of these has to be readable from lids, brows, pupil size and timing
 * alone.
 */
export const Emotion = z.enum([
  'neutral',
  'happy',
  'curious',
  'skeptical',
  'sleepy',
  'sad',
  'annoyed',
  'shy',
  'excited',
  'focused',
  'thinking',
  'stressed',
  'shocked',
]);

/** One of the character's expressions. */
export type Emotion = z.infer<typeof Emotion>;

/**
 * One-shot eye animations. A gesture plays over an emotion and returns to it,
 * so it punctuates a state rather than replacing one.
 */
export const GestureKind = z.enum([
  'double_take',
  'eye_roll',
  'squint',
  'wide_eyes',
  'slow_blink',
  'nod',
  'shake',
  'yawn',
]);

/** One of the one-shot eye animations. */
export type GestureKind = z.infer<typeof GestureKind>;

/**
 * What a memory is about. `self` is something he learned about himself.
 */
export const FactKind = z.enum(['person', 'preference', 'event', 'self']);

/** What a memory is about. */
export type FactKind = z.infer<typeof FactKind>;

/**
 * What the model is allowed to do, and who carries it out. Section 7.3 of
 * docs/architecture.md.
 *
 * The server turns this into function declarations at session setup, so a tool
 * is described in exactly one place. `client` tools are forwarded down the
 * socket and answered immediately, so a slow hand never stalls speech.
 *
 * `server` tools are carried out in `apps/server/src/tools` and never reach the
 * browser as a call. They answer from SQLite, so they are as prompt as the
 * client ones. Only tools something can answer are declared: one the model can
 * call and nothing carries out is worse than not having it.
 */
export const tools = {
  look_at: {
    executor: 'client',
    description:
      'Point your eyes at something, when there is a reason to look there. Your eyes already follow faces by themselves, so most turns need no call.',
    input: z.object({
      target: GazeTarget,
      hold_ms: z.number().int().min(200).max(10_000).default(2000),
    }),
  },
  set_emotion: {
    executor: 'client',
    description:
      'Change your facial expression to what you actually feel about what was just said or seen. Pick the emotion that fits, and vary it: curious, shocked, skeptical, happy, shy, focused, annoyed, stressed, excited and sad are all yours. Thinking is for being stuck on a question, not for forming a reply, so it is rare. Every expression shows at full strength, so set one only when the feeling is clear, and match it to your words: teasing is not happy. Your face returns to neutral by itself after a while; set it again if the feeling lasts.',
    input: z.object({ emotion: Emotion }),
  },
  gesture: {
    executor: 'client',
    description:
      'A one-shot eye animation, for punctuation: a squint at something doubtful, an eye roll at a bad joke. Rare is funnier.',
    input: z.object({ kind: GestureKind }),
  },
  who_is_here: {
    executor: 'client',
    description:
      'Who is in front of you right now, by name when you know their face, and who is talking. Call it when you are not sure who you are talking to, or when a second person appears. It answers from what you see, without asking anybody.',
    input: z.object({}),
  },
  name_face: {
    executor: 'client',
    description:
      'Learn the face of the person in front of you, so you know them next time. Call it once somebody tells you their name, with that name. Not for a name you guessed.',
    input: z.object({ name_of_person: z.string().trim().min(1).max(60) }),
  },
  remember: {
    executor: 'server',
    description:
      'Save one thing worth knowing tomorrow: a name, something they like or hate, something that happened, something you were taught, something you found out about yourself. One short sentence that makes sense on its own, in the language you speak. Not small talk, and not something you already remember.',
    input: z.object({
      text: z.string().min(1).max(280),
      kind: FactKind,
      importance: z.number().int().min(1).max(5),
    }),
  },
  recall: {
    executor: 'server',
    description:
      'Search what you remember from other days. Use it when somebody mentions something you might have been told before, or asks whether you remember. A few keywords work best.',
    input: z.object({ query: z.string().min(1).max(120) }),
  },
} as const;

/** The name of a tool the model can call. */
export type ToolName = keyof typeof tools;

/** Every tool name, for building declarations and for the debug panel. */
export const TOOL_NAMES = Object.keys(tools) as ToolName[];

/** The arguments of a server-executed tool, already parsed. */
export const ServerToolInput = z.discriminatedUnion('name', [
  tools.remember.input.extend({ name: z.literal('remember') }),
  tools.recall.input.extend({ name: z.literal('recall') }),
]);

/** The arguments of a server-executed tool, already parsed. */
export type ServerToolInput = z.infer<typeof ServerToolInput>;
