/** Fills the frozen persona for one person, from values nothing has validated yet. */
import { loadPersona } from '@m8/persona';
import { DEFAULT_LANGUAGE, LANGUAGE_NAMES, LanguageCode, PersonName } from '@m8/shared';

/** What the persona says in place of a name that did not arrive or did not validate. */
const NAMELESS = 'somebody whose name you do not know yet';

/** Who a persona is filled in for. Neither value is trusted. */
export interface PersonaFor {
  /** The code of the only language he speaks. */
  language: string | undefined;
  /** Who set him up. */
  name: string | undefined;
}

/**
 * Load the persona for one person.
 *
 * @param who - The language code and the name, unvalidated.
 * @returns The persona with its slots filled. Anything unrecognised falls back:
 * a stale bookmark should not be the reason the character cannot speak.
 * @throws {Error} When the persona file is missing.
 */
export function personaFor(who: PersonaFor): Promise<string> {
  const language = LanguageCode.safeParse(who.language).data ?? DEFAULT_LANGUAGE;
  return loadPersona({
    language: LANGUAGE_NAMES[language].english,
    accent: LANGUAGE_NAMES[language].accent,
    spokenName: LANGUAGE_NAMES[language].spokenName,
    name: PersonName.safeParse(who.name).data ?? NAMELESS,
  });
}
