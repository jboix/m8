/** What the setup screen collects: the one language he speaks, and who set him up. */
import { z } from 'zod';

/** The languages the character can be set to. ISO 639-1 codes. */
export const Language = z.enum(['fr', 'en', 'es', 'ja']);

/** One of the languages the character can be set to. */
export type Language = z.infer<typeof Language>;

/** The language a session opens in when the connect does not carry a valid one. */
export const DEFAULT_LANGUAGE: Language = 'en';

/** How a language is named, to the person choosing it and to the model. */
interface LanguageName {
  /** Its name in its own script, which is what the setup screen shows. */
  native: string;
  /** Its name in English, which is what the persona is written in. */
  english: string;
  /**
   * The standard accent he speaks it with, as the persona names it. The native
   * audio model picks its own accent unless it is told, and then it drifts.
   */
  accent: string;
  /**
   * How he says his own name, m8, in this language: the letter M and then the
   * number eight, both as this language says them.
   */
  spokenName: string;
}

/** Every language's names. */
export const LANGUAGE_NAMES: Record<Language, LanguageName> = {
  fr: {
    native: 'Français',
    english: 'French',
    accent: 'standard metropolitan French, from Paris',
    spokenName: 'em huit',
  },
  en: { native: 'English', english: 'English', accent: 'General American', spokenName: 'em eight' },
  es: {
    native: 'Español',
    english: 'Spanish',
    accent: 'standard Castilian, from central Spain',
    spokenName: 'eme ocho',
  },
  ja: {
    native: '日本語',
    english: 'Japanese',
    accent: 'standard Tokyo Japanese',
    spokenName: 'エムはち (emu hachi)',
  },
};

/** The longest name the setup screen accepts. It ends up inside the persona. */
export const MAX_NAME_LENGTH = 40;

/**
 * The name of the person who set him up.
 *
 * Letters, marks, spaces, apostrophes, hyphens and dots only: the name is
 * written into the system instruction, so it must not be able to carry one.
 */
export const PersonName = z
  .string()
  .trim()
  .min(1)
  .max(MAX_NAME_LENGTH)
  .regex(/^[\p{L}\p{M}][\p{L}\p{M} '’.-]*$/u);

/** The finished setup, as it is stored in the browser and sent on the connect. */
export const Setup = z.object({
  /** The only language he speaks. */
  language: Language,
  /** Who set him up. */
  name: PersonName,
});

/** The finished setup. */
export type Setup = z.infer<typeof Setup>;
