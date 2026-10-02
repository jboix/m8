/**
 * What a person may change about the character without opening the debug rig.
 * Kept in the browser, and validated when it is read back, so a stored value
 * from an older version falls back to the defaults rather than breaking him.
 */
import { z } from 'zod';
import { DEFAULT_LISTENING, DEFAULT_VOICE, Listening, Voice } from './protocol.ts';

/** A value from 0 to 1. */
const Amount = z.number().min(0).max(1);

/** The person's settings. */
export const Settings = z.object({
  /** Whether the eyes make their small robot sounds. */
  eyeSounds: z.boolean(),
  /** How loud those sounds are, 0 silent to 1 as designed. */
  eyeSoundVolume: Amount,
  /** Which of the model's voices he speaks with. */
  voice: Voice,
  /** How much machine is put on top of the voice, 0 none to 1 all of it. */
  robot: Amount,
  /** Whether he listens to the room for music, knocks and the like. */
  roomSounds: z.boolean(),
  /** Whether he starts talking by himself when he is bored. */
  speaksUp: z.boolean(),
  /** Whether he learns faces and tells people apart by them. Off until somebody says so. */
  knowsFaces: z.boolean(),
  /** Who marks the turns: anybody who speaks, or the person with the talk button. */
  // Defaulted, so settings stored before it existed keep their other values.
  listensTo: Listening.default(DEFAULT_LISTENING),
  /** Whether the settings offer the rig, and the stage shows its button. */
  // Defaulted, so settings stored before it existed keep their other values.
  developer: z.boolean().default(false),
});

/** The person's settings. */
export type Settings = z.infer<typeof Settings>;

/** What he is like before anybody has changed anything. */
export const DEFAULT_SETTINGS: Settings = {
  eyeSounds: true,
  eyeSoundVolume: 1,
  voice: DEFAULT_VOICE,
  robot: 0.45,
  roomSounds: true,
  speaksUp: true,
  knowsFaces: false,
  listensTo: DEFAULT_LISTENING,
  developer: false,
};
