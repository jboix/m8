/**
 * What the browser and the server say to each other. Section 7.2 of
 * docs/architecture.md.
 *
 * One websocket carries everything. Binary frames are PCM16 audio, going up at
 * 16 kHz and coming down at 24 kHz; every other message is one of these.
 *
 * The browser speaks this, never a provider's protocol. Translation happens in
 * the server's adapters, which is what lets the model behind it change without
 * the browser noticing.
 */
import { z } from 'zod';
import { SenseEvent } from './events.ts';
import { Emotion, GazeTarget, GestureKind } from './tools.ts';

/** A note: text appended to the session with no reply expected. */
const SensesNote = z.object({
  type: z.literal('senses.note'),
  text: z.string().max(500),
});

/** An interrupt: text appended, and the character answers unprompted. */
const SensesInterrupt = z.object({
  type: z.literal('senses.interrupt'),
  text: z.string().max(500),
});

/**
 * The person started or stopped talking, decided in the browser. Sent only
 * when the session was opened with `listening` set to something other than
 * `everyone`; the model's own detector marks the turns otherwise.
 */
const SensesActivity = z.object({
  type: z.literal('senses.activity'),
  state: z.enum(['start', 'end']),
});

/** The answer to a tool the browser carried out. */
const ToolResult = z.object({
  type: z.literal('tool.result'),
  callId: z.string(),
  ok: z.boolean(),
  /** What to tell the model, for a tool that answers with words. */
  answer: z.string().max(500).optional(),
});

/**
 * The longest frame accepted, in base64 characters. A 320 pixel JPEG at half
 * quality is about a fifth of this, so anything near it is not one of ours.
 */
export const MAX_FRAME_CHARS = 80_000;

/**
 * One camera frame for the model to see. At most one a second, small
 * and heavily compressed, and only while the session is live.
 */
const VisionFrame = z.object({
  type: z.literal('vision.frame'),
  /** The JPEG, base64 encoded, without a data URL prefix. */
  jpeg: z.string().min(1).max(MAX_FRAME_CHARS),
});

/** The most events one batch may carry. */
export const MAX_BATCH_EVENTS = 100;

/**
 * What the local senses picked up lately, for the session's raw log. Only the
 * slow, meaningful kinds: see `apps/web/src/brain/event-log.ts`.
 */
const EventsBatch = z.object({
  type: z.literal('events.batch'),
  events: z.array(SenseEvent).max(MAX_BATCH_EVENTS),
});

/** Anything the browser sends that is not audio. */
export const UpMessage = z.discriminatedUnion('type', [
  SensesNote,
  SensesInterrupt,
  SensesActivity,
  ToolResult,
  VisionFrame,
  EventsBatch,
]);

/** Anything the browser sends that is not audio. */
export type UpMessage = z.infer<typeof UpMessage>;

/** The arguments of a client-executed tool, already parsed. */
const ToolInput = z.discriminatedUnion('name', [
  z.object({
    name: z.literal('look_at'),
    target: GazeTarget,
    hold_ms: z.number().int().min(200).max(10_000).default(2000),
  }),
  z.object({ name: z.literal('set_emotion'), emotion: Emotion }),
  z.object({ name: z.literal('gesture'), kind: GestureKind }),
  z.object({ name: z.literal('who_is_here') }),
  z.object({ name: z.literal('name_face'), name_of_person: z.string().trim().min(1).max(60) }),
]);

/** The arguments of a client-executed tool, already parsed. */
export type ToolInput = z.infer<typeof ToolInput>;

/** A tool for the browser to carry out. */
const ToolCall = z.object({
  type: z.literal('tool.call'),
  callId: z.string(),
  input: ToolInput,
});

/**
 * A tool the server carried out by itself, reported so the session inspector
 * can show it. Nothing is expected back.
 */
const ToolRan = z.object({
  type: z.literal('tool.ran'),
  name: z.enum(['remember', 'recall']),
  /** The arguments, as JSON. */
  input: z.string(),
  /** What the model was told, as JSON. */
  result: z.string(),
});

/** What was said, by either side. */
const Transcript = z.object({
  type: z.literal('transcript'),
  role: z.enum(['user', 'model']),
  text: z.string(),
});

/** Barge-in: stop playing what is queued, immediately. */
const SpeechInterrupted = z.object({ type: z.literal('speech.interrupted') });

/** Where the live session is up to. */
const SessionState = z.object({
  type: z.literal('session.state'),
  state: z.enum(['connecting', 'live', 'sleeping', 'reconnecting', 'failed']),
  detail: z.string().optional(),
});

/** Anything the server sends that is not audio. */
export const DownMessage = z.discriminatedUnion('type', [
  ToolCall,
  ToolRan,
  Transcript,
  SpeechInterrupted,
  SessionState,
]);

/** Anything the server sends that is not audio. */
export type DownMessage = z.infer<typeof DownMessage>;

/** Where the live session is up to. */
export type SessionState = z.infer<typeof SessionState>;

/** Sample rate the microphone is sent up at, which is what Gemini Live expects. */
export const MIC_SAMPLE_RATE = 16000;

/**
 * Sample rate the model's voice arrives at. Measured, not read: the Live API
 * guide says 16 kHz for both directions and the audio is 24 kHz, which plays
 * half again too slow if taken at its word.
 */
export const VOICE_SAMPLE_RATE = 24000;

/**
 * The voices the live model can speak with.
 *
 * @remarks
 * Provider names, but not model names: changing the live model keeps the
 * character's voice, which is why this sits with the protocol rather than with
 * the model settings. Listed so the debug panel can offer them; a timbre cannot
 * be judged from a name, so the way to choose one is to hear it.
 */
export const Voice = z.enum([
  'Puck',
  'Charon',
  'Kore',
  'Fenrir',
  'Aoede',
  'Leda',
  'Orus',
  'Zephyr',
  'Enceladus',
  'Iapetus',
  'Umbriel',
  'Algieba',
  'Despina',
  'Erinome',
  'Algenib',
  'Rasalgethi',
  'Laomedeia',
  'Achernar',
  'Alnilam',
  'Schedar',
  'Gacrux',
  'Pulcherrima',
  'Achird',
  'Zubenelgenubi',
  'Vindemiatrix',
  'Sadachbia',
  'Sadaltager',
  'Sulafat',
  'Autonoe',
  'Callirrhoe',
]);

/** One of the voices the live model can speak with. */
export type Voice = z.infer<typeof Voice>;

/** The voice a session opens with when nothing asks for another. */
export const DEFAULT_VOICE: Voice = 'Fenrir';

/**
 * Who marks the turns of the conversation.
 *
 * - `everyone`: the model's own voice activity detector. Anybody who speaks
 *   takes a turn, and anybody who speaks over him interrupts him.
 * - `button`: the person, by holding the talk button. He hears nothing else.
 */
export const Listening = z.enum(['everyone', 'button']);

/** Who marks the turns of the conversation. */
export type Listening = z.infer<typeof Listening>;

/** How a session listens when nothing asks for another way. */
export const DEFAULT_LISTENING: Listening = 'everyone';
