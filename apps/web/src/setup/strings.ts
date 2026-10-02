/**
 * Everything the setup screen and the first greeting say, in each language.
 * Written in his voice: the eyes are above the card, and he is the one asking.
 */
import { DEFAULT_LANGUAGE, type Language, LanguageCode } from '@m8/shared';

/** The setup screen's words in one language. */
interface SetupStrings {
  /** Above the language cards. */
  askLanguage: string;
  /** Above the name field. */
  askName: string;
  /** Inside the empty name field. */
  namePlaceholder: string;
  /** The button that moves to the name step. */
  next: string;
  /** The button that returns to the language step. */
  back: string;
  /** The button that finishes setup. */
  start: string;
  /** Under the name field: where the camera and the microphone go once he is awake. */
  disclosure: string;
  /** Under the eyes, while the browser will not let the page use sound until it is touched. */
  tapToWake: string;
  /** The first thing he says, with `{name}` where the name goes. */
  greeting: string;
}

/** The words, per language. */
export const STRINGS: Record<Language, SetupStrings> = {
  en: {
    askLanguage: 'Which language should I speak?',
    askName: 'And what is your name?',
    namePlaceholder: 'Your name',
    next: 'Next',
    back: 'Back',
    start: 'Wake me up',
    tapToWake: 'Tap anywhere so I can hear you and talk.',
    disclosure:
      'While I am awake, what the camera sees and the microphone hears is sent to an online AI service. So is what I remember about you, because that service writes and reads my memory. That is how I see, hear and remember you.',
    greeting: "Hey {name}, I'm m8. Nice to meet you.",
  },
  fr: {
    askLanguage: 'Quelle langue dois-je parler ?',
    askName: 'Et toi, comment tu t’appelles ?',
    namePlaceholder: 'Ton prénom',
    next: 'Suivant',
    back: 'Retour',
    start: 'Réveille-moi',
    tapToWake: 'Touche l’écran pour que je puisse t’entendre et parler.',
    disclosure:
      'Quand je suis réveillé, ce que voit la caméra et ce qu’entend le micro est envoyé à un service d’IA en ligne. Ce dont je me souviens de toi aussi, parce que ce service écrit et lit ma mémoire. C’est comme ça que je te vois, que je t’entends et que je me souviens de toi.',
    greeting: 'Salut {name}, moi c’est m8. Ravi de te rencontrer.',
  },
  es: {
    askLanguage: '¿Qué idioma tengo que hablar?',
    askName: '¿Y tú cómo te llamas?',
    namePlaceholder: 'Tu nombre',
    next: 'Siguiente',
    back: 'Atrás',
    start: 'Despiértame',
    tapToWake: 'Toca la pantalla para que pueda oírte y hablar.',
    disclosure:
      'Mientras estoy despierto, lo que ve la cámara y lo que oye el micrófono se envía a un servicio de IA en línea. Lo que recuerdo de ti también, porque ese servicio escribe y lee mi memoria. Así es como te veo, te oigo y te recuerdo.',
    greeting: 'Hola {name}, soy m8. Encantado de conocerte.',
  },
  ja: {
    askLanguage: 'なにごで はなせばいい？',
    askName: 'きみの なまえは？',
    namePlaceholder: 'なまえ',
    next: 'つぎへ',
    back: 'もどる',
    start: 'おこして',
    tapToWake: 'がめんを タッチしてね。そうしたら きこえるし、はなせるよ。',
    disclosure:
      'おきている あいだ、カメラに うつるものと マイクに はいる おとは、オンラインの AI サービスに おくられるよ。ぼくが きみについて おぼえている ことも おくられるよ。その サービスが ぼくの きおくを かいたり よんだり するからね。そうやって きみを みたり きいたり おぼえたり しているんだ。',
    greeting: 'やあ、{name}。ぼくは m8。はじめまして。',
  },
};

/**
 * The scripted line that makes him introduce himself.
 *
 * @param language - The language he was set to.
 * @param name - Who set him up.
 * @returns A `[script]` line. The persona tells him to say the quoted sentence
 * exactly, so the first words are ours in every language.
 */
export function greetingLine(language: Language, name: string): string {
  return `[script] "${STRINGS[language].greeting.replace('{name}', name)}"`;
}

/**
 * Pick the language the screen opens in.
 *
 * @param locales - The browser's preferred locales, most wanted first.
 * @returns The first one that is offered, or the default.
 */
export function preferredLanguage(locales: readonly string[]): Language {
  for (const locale of locales) {
    const offered = LanguageCode.safeParse(locale.slice(0, 2).toLowerCase());
    if (offered.success) return offered.data;
  }
  return DEFAULT_LANGUAGE;
}
