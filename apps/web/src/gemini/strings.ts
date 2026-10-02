/**
 * What the Gemini key step and the models section say, in each language. The
 * setup step is in his voice, like the rest of setup. The server's own error
 * messages are passed on in English, because they come from Gemini.
 */
import type { ContextSize, Language } from '@m8/shared';

/** The words in one language. */
export interface GeminiStrings {
  /** Above the key field on the setup step. */
  askKey: string;
  /** Inside the empty key field. */
  keyPlaceholder: string;
  /** Under the key field: where to get one, and where it is kept. */
  keyHint: string;
  /** The button that checks the key with Gemini. */
  checkKey: string;
  /** The same button while Gemini is being asked. */
  checking: string;
  /** Above the two model pickers on the setup step. */
  askModels: string;
  /** The picker for the model that holds the conversation. */
  liveModel: string;
  /** Under it: what it does, and that changing it starts the conversation over. */
  liveModelHint: string;
  /** The picker for the model that writes his memory. */
  memoryModel: string;
  /** Under it: what it does. */
  memoryModelHint: string;
  /** The button that finishes the step. */
  next: string;
  /** The name of the settings tab the section is in. */
  heading: string;
  /** The label beside the masked key. */
  key: string;
  /** The button that opens the field for a new key. */
  replace: string;
  /** The button that keeps the old key. */
  cancel: string;
  /** The field for the daily limit. */
  callsPerDay: string;
  /** Under it: what counts, and what 0 means. */
  callsPerDayHint: string;
  /** Shown while the models are being listed. */
  loadingModels: string;
  /** The picker for how much of the conversation every turn re-reads. */
  context: string;
  /** Its three choices. */
  contextSizes: Record<ContextSize, string>;
  /** Under it: what it trades, and that changing it starts over. */
  contextHint: string;
}

/** The words, per language. */
export const GEMINI_STRINGS: Record<Language, GeminiStrings> = {
  en: {
    askKey: 'I need a Gemini API key to talk.',
    keyPlaceholder: 'Your Gemini API key',
    keyHint:
      'You can get one at aistudio.google.com/apikey. It stays on the server that runs me, sealed in my database, and goes only to Gemini.',
    checkKey: 'Check the key',
    checking: 'Asking Gemini…',
    askModels: 'Which models should I use?',
    liveModel: 'Conversation',
    liveModelHint: 'Hears you, sees you and talks. Changing it starts the conversation over.',
    memoryModel: 'Memory',
    memoryModelHint: 'Writes down what happened after we talk. A cheap model is fine.',
    next: 'Next',
    heading: 'Gemini',
    key: 'API key',
    replace: 'Replace',
    cancel: 'Cancel',
    callsPerDay: 'Calls a day',
    callsPerDayHint:
      'Each memory request and each conversation opened is one call, counted over 24 hours. 0 means no limit.',
    loadingModels: 'Listing the models…',
    context: 'Conversation memory',
    contextSizes: { short: 'Short', medium: 'Medium', long: 'Long' },
    contextHint:
      'How much of what was just said he reads again on every turn. Longer remembers more and costs more per turn. Changing it starts the conversation over.',
  },
  fr: {
    askKey: 'J’ai besoin d’une clé d’API Gemini pour parler.',
    keyPlaceholder: 'Ta clé d’API Gemini',
    keyHint:
      'Tu peux en obtenir une sur aistudio.google.com/apikey. Elle reste sur le serveur qui me fait tourner, scellée dans ma base de données, et ne va qu’à Gemini.',
    checkKey: 'Vérifier la clé',
    checking: 'Je demande à Gemini…',
    askModels: 'Quels modèles dois-je utiliser ?',
    liveModel: 'Conversation',
    liveModelHint: 'T’entend, te voit et parle. Le changer recommence la conversation.',
    memoryModel: 'Mémoire',
    memoryModelHint: 'Écrit ce qui s’est passé après qu’on a parlé. Un modèle bon marché suffit.',
    next: 'Suivant',
    heading: 'Gemini',
    key: 'Clé d’API',
    replace: 'Remplacer',
    cancel: 'Annuler',
    callsPerDay: 'Appels par jour',
    callsPerDayHint:
      'Chaque demande de mémoire et chaque conversation ouverte compte pour un appel, sur 24 heures. 0 veut dire sans limite.',
    loadingModels: 'Je liste les modèles…',
    context: 'Mémoire de la conversation',
    contextSizes: { short: 'Courte', medium: 'Moyenne', long: 'Longue' },
    contextHint:
      'Ce qu’il relit de la conversation à chaque tour. Plus long, il se souvient de plus et chaque tour coûte plus. Changer ceci recommence la conversation.',
  },
  es: {
    askKey: 'Necesito una clave de API de Gemini para hablar.',
    keyPlaceholder: 'Tu clave de API de Gemini',
    keyHint:
      'Puedes conseguir una en aistudio.google.com/apikey. Se queda en el servidor que me ejecuta, sellada en mi base de datos, y solo va a Gemini.',
    checkKey: 'Comprobar la clave',
    checking: 'Preguntando a Gemini…',
    askModels: '¿Qué modelos uso?',
    liveModel: 'Conversación',
    liveModelHint: 'Te oye, te ve y habla. Cambiarlo reinicia la conversación.',
    memoryModel: 'Memoria',
    memoryModelHint: 'Escribe lo que pasó después de hablar. Basta con un modelo barato.',
    next: 'Siguiente',
    heading: 'Gemini',
    key: 'Clave de API',
    replace: 'Cambiar',
    cancel: 'Cancelar',
    callsPerDay: 'Llamadas al día',
    callsPerDayHint:
      'Cada petición de memoria y cada conversación abierta cuenta como una llamada, en 24 horas. 0 significa sin límite.',
    loadingModels: 'Buscando los modelos…',
    context: 'Memoria de la conversación',
    contextSizes: { short: 'Corta', medium: 'Media', long: 'Larga' },
    contextHint:
      'Cuánto de lo que se acaba de decir vuelve a leer en cada turno. Más larga recuerda más y cada turno cuesta más. Cambiarlo reinicia la conversación.',
  },
  ja: {
    askKey: 'はなすには Gemini の API キーが いるよ。',
    keyPlaceholder: 'Gemini の API キー',
    keyHint:
      'aistudio.google.com/apikey で もらえるよ。キーは ぼくを うごかしている サーバーの データベースに かぎを かけて しまわれて、Gemini にだけ おくられるよ。',
    checkKey: 'キーを たしかめる',
    checking: 'Gemini に きいているよ…',
    askModels: 'どの モデルを つかえばいい？',
    liveModel: 'かいわ',
    liveModelHint: 'きいて、みて、はなす モデル。かえると、はなしは さいしょからに なるよ。',
    memoryModel: 'きおく',
    memoryModelHint:
      'はなしの あとで、あったことを かきとめる モデル。やすい もので だいじょうぶ。',
    next: 'つぎへ',
    heading: 'Gemini',
    key: 'API キー',
    replace: 'かえる',
    cancel: 'やめる',
    callsPerDay: '1にちの よびだし',
    callsPerDayHint:
      'きおくの おねがいと、ひらいた かいわが それぞれ 1かい。24じかんで かぞえるよ。0 は せいげん なし。',
    loadingModels: 'モデルを さがしているよ…',
    context: 'かいわの きおく',
    contextSizes: { short: 'みじかい', medium: 'ふつう', long: 'ながい' },
    contextHint:
      'いま はなしたことを、まいかい どれだけ よみなおすか。ながいと よく おぼえているけど、1かいごとに おかねが かかるよ。かえると、はなしは さいしょからに なるよ。',
  },
};
