/** What the key screen says, in each language. Written in his voice, like the setup screen. */
import type { Language } from '@m8/shared';

/** The key screen's words in one language. */
interface AccessStrings {
  /** Above the field. */
  ask: string;
  /** Inside the empty field. */
  placeholder: string;
  /** The button that gives the key. */
  unlock: string;
  /** Under the field, after a key that was refused. */
  wrong: string;
  /** Under the field, after too many keys were refused. */
  wait: string;
}

/** The words, per language. */
export const ACCESS_STRINGS: Record<Language, AccessStrings> = {
  en: {
    ask: 'I only talk to people with the key.',
    placeholder: 'The key',
    unlock: 'Let me in',
    wrong: 'That is not it.',
    wait: 'Too many tries. Give me ten minutes.',
  },
  fr: {
    ask: 'Je ne parle qu’aux gens qui ont la clé.',
    placeholder: 'La clé',
    unlock: 'Laisse-moi entrer',
    wrong: 'Ce n’est pas ça.',
    wait: 'Trop d’essais. Laisse-moi dix minutes.',
  },
  es: {
    ask: 'Solo hablo con quien tiene la llave.',
    placeholder: 'La llave',
    unlock: 'Déjame entrar',
    wrong: 'Esa no es.',
    wait: 'Demasiados intentos. Dame diez minutos.',
  },
  ja: {
    ask: 'かぎを もっている ひととだけ はなすよ。',
    placeholder: 'かぎ',
    unlock: 'いれて',
    wrong: 'それじゃ ないよ。',
    wait: 'まちがいが おおすぎるよ。10ぷん まってね。',
  },
};
