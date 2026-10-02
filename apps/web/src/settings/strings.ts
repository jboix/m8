/** What the settings sheet says, in each language. */
import type { Language } from '@m8/shared';

/** The sheet's words in one language. */
export interface SettingsStrings {
  /** The sheet's title, and the button that opens it. */
  title: string;
  /** The heading over everything about sound. */
  sound: string;
  /** The switch for the eyes' small robot sounds. */
  eyeSounds: string;
  /** The slider for how loud those sounds are. */
  eyeSoundVolume: string;
  /** The picker for his voice. */
  voice: string;
  /** Under the voice picker: changing it starts the conversation over. */
  voiceHint: string;
  /** The slider for how much machine is put on the voice. */
  robot: string;
  /** The heading over how he behaves. */
  behaviour: string;
  /** The switch for listening to the room. */
  roomSounds: string;
  /** The switch for starting to talk by himself. */
  speaksUp: string;
  /** The picker for who marks the turns. */
  listensTo: string;
  /** The picker's choice for the model's own detector: anybody who speaks. */
  listensToEveryone: string;
  /** The picker's choice for the talk button. */
  listensToButton: string;
  /** Under the picker: what the button does, and that changing it starts over. */
  listensToHint: string;
  /** What the talk button says to a screen reader. */
  holdToTalk: string;
  /** The switch for learning faces. */
  knowsFaces: string;
  /** Under the switch: where the faces go, and where they do not. */
  knowsFacesHint: string;
  /** The button that learns the face in front of the camera as the person set up. */
  learnMyFace: string;
  /** Shown after the button when there was no face to learn. */
  noFaceToLearn: string;
  /** Shown after the button when a face is in view but not close or clear enough yet. */
  faceNotYet: string;
  /** The heading over the faces he knows. */
  knownFaces: string;
  /** Shown when he knows no faces yet. */
  knowsNobody: string;
  /** The heading over what he remembers. */
  memory: string;
  /** How many things he remembers, with `{count}` filled in. */
  remembers: string;
  /** Shown when he remembers nothing yet. */
  remembersNothing: string;
  /** The button beside one memory. */
  forget: string;
  /** The button that deletes every memory. */
  forgetAll: string;
  /** The same button, asking to be pressed again. */
  forgetAllConfirm: string;
  /** Shown when the memory could not be read. */
  memoryFault: string;
  /** The heading over who he was set up for. */
  you: string;
  /** Who he was set up for, with `{name}` and `{language}` filled in. */
  setUpFor: string;
  /** The button that shows the setup screen again. */
  setUpAgain: string;
  /** The button that closes the sheet. */
  close: string;
  /** The tab with sound, behaviour, the setup and the developer options. */
  general: string;
  /** The tab with the faces he knows. */
  people: string;
  /** The switch that offers the rig. */
  developer: string;
  /** Under the switch: what the rig is. */
  developerHint: string;
  /** Under the switch in a development build, where it cannot be turned off. */
  developerAlwaysOn: string;
  /** The button that closes the settings and opens the rig. */
  openRig: string;
}

/** The words, per language. */
export const SETTINGS_STRINGS: Record<Language, SettingsStrings> = {
  en: {
    title: 'Settings',
    sound: 'Sound',
    eyeSounds: 'Eye sounds',
    eyeSoundVolume: 'Eye sound volume',
    voice: 'Voice',
    voiceHint: 'Changing the voice starts the conversation over.',
    robot: 'Robot effect',
    behaviour: 'Behaviour',
    roomSounds: 'Listens to the room (music, knocks, barks)',
    speaksUp: 'Speaks up when he is bored',
    listensTo: 'Listens to',
    listensToEveryone: 'Everyone who speaks',
    listensToButton: 'The talk button only',
    listensToHint:
      'With the button, he hears you only while you hold it, or the space bar. Use it in a room with other people talking. Changing this starts the conversation over.',
    holdToTalk: 'Hold to talk',
    knowsFaces: 'Knows faces',
    knowsFacesHint:
      'He learns a face when somebody tells him their name, and tells people apart by it. The faces are stored with his memory, on the machine that runs him. They never go to the AI service, only the names do.',
    learnMyFace: 'Learn my face',
    noFaceToLearn: 'He could not see a face clearly. Look at the camera and try again.',
    faceNotYet:
      'He can see you, but not well enough yet. Come a little closer, face the camera, and try again in a moment.',
    knownFaces: 'Faces he knows',
    knowsNobody: 'Nobody yet.',
    memory: 'Memory',
    remembers: 'He remembers {count} things. They stay on the machine he runs on.',
    remembersNothing: 'He remembers nothing yet.',
    forget: 'Forget',
    forgetAll: 'Forget everything',
    forgetAllConfirm: 'Press again to forget everything',
    memoryFault: 'His memory could not be read.',
    you: 'You',
    setUpFor: 'Set up for {name}, in {language}.',
    setUpAgain: 'Set up again',
    close: 'Close',
    general: 'General',
    people: 'People',
    developer: 'Developer options',
    developerHint:
      'Adds the rig: a panel that shows what he sees, hears and thinks, and lets you move his face by hand.',
    developerAlwaysOn: 'Always on in a development build.',
    openRig: 'Open the rig',
  },
  fr: {
    title: 'Réglages',
    sound: 'Son',
    eyeSounds: 'Sons des yeux',
    eyeSoundVolume: 'Volume des sons des yeux',
    voice: 'Voix',
    voiceHint: 'Changer de voix recommence la conversation.',
    robot: 'Effet robot',
    behaviour: 'Comportement',
    roomSounds: 'Écoute la pièce (musique, coups à la porte, aboiements)',
    speaksUp: 'Prend la parole quand il s’ennuie',
    listensTo: 'Écoute',
    listensToEveryone: 'Tous ceux qui parlent',
    listensToButton: 'Le bouton parler seulement',
    listensToHint:
      'Avec le bouton, il ne vous entend que pendant que vous le tenez, ou la barre d’espace. Utile dans une pièce où d’autres personnes parlent. Changer ceci recommence la conversation.',
    holdToTalk: 'Maintenir pour parler',
    knowsFaces: 'Reconnaît les visages',
    knowsFacesHint:
      'Il apprend un visage quand quelqu’un lui dit son nom, et il distingue les gens grâce à lui. Les visages sont gardés avec sa mémoire, sur la machine qui le fait tourner. Ils ne vont jamais au service d’IA, seuls les noms y vont.',
    learnMyFace: 'Apprendre mon visage',
    noFaceToLearn: 'Il n’a pas bien vu de visage. Regardez la caméra et réessayez.',
    faceNotYet:
      'Il vous voit, mais pas encore assez bien. Approchez-vous un peu, regardez la caméra et réessayez dans un instant.',
    knownFaces: 'Visages qu’il connaît',
    knowsNobody: 'Personne pour l’instant.',
    memory: 'Mémoire',
    remembers: 'Il se souvient de {count} choses. Elles restent sur la machine où il tourne.',
    remembersNothing: 'Il ne se souvient encore de rien.',
    forget: 'Oublier',
    forgetAll: 'Tout oublier',
    forgetAllConfirm: 'Appuie encore pour tout oublier',
    memoryFault: 'Impossible de lire sa mémoire.',
    you: 'Toi',
    setUpFor: 'Configuré pour {name}, en {language}.',
    setUpAgain: 'Reconfigurer',
    close: 'Fermer',
    general: 'Général',
    people: 'Personnes',
    developer: 'Options de développement',
    developerHint:
      'Ajoute le panneau de débogage. Il montre ce qu’il voit, entend et pense, et vous permet de bouger son visage à la main.',
    developerAlwaysOn: 'Toujours activées dans une version de développement.',
    openRig: 'Ouvrir le panneau de débogage',
  },
  es: {
    title: 'Ajustes',
    sound: 'Sonido',
    eyeSounds: 'Sonidos de los ojos',
    eyeSoundVolume: 'Volumen de los sonidos de los ojos',
    voice: 'Voz',
    voiceHint: 'Cambiar la voz reinicia la conversación.',
    robot: 'Efecto robot',
    behaviour: 'Comportamiento',
    roomSounds: 'Escucha la habitación (música, golpes, ladridos)',
    speaksUp: 'Habla por su cuenta cuando se aburre',
    listensTo: 'Escucha a',
    listensToEveryone: 'Todos los que hablan',
    listensToButton: 'Solo el botón de hablar',
    listensToHint:
      'Con el botón, solo te oye mientras lo mantienes pulsado, o la barra espaciadora. Úsalo en una habitación donde hable más gente. Cambiar esto reinicia la conversación.',
    holdToTalk: 'Mantén pulsado para hablar',
    knowsFaces: 'Reconoce caras',
    knowsFacesHint:
      'Aprende una cara cuando alguien le dice su nombre, y distingue a la gente por ella. Las caras se guardan con su memoria, en la máquina donde funciona. Nunca van al servicio de IA, solo van los nombres.',
    learnMyFace: 'Aprender mi cara',
    noFaceToLearn: 'No ha visto bien ninguna cara. Mira a la cámara y prueba otra vez.',
    faceNotYet:
      'Te ve, pero todavía no lo bastante bien. Acércate un poco, mira a la cámara y prueba otra vez en un momento.',
    knownFaces: 'Caras que conoce',
    knowsNobody: 'Nadie todavía.',
    memory: 'Memoria',
    remembers: 'Recuerda {count} cosas. Se quedan en la máquina donde funciona.',
    remembersNothing: 'Todavía no recuerda nada.',
    forget: 'Olvidar',
    forgetAll: 'Olvidarlo todo',
    forgetAllConfirm: 'Pulsa otra vez para olvidarlo todo',
    memoryFault: 'No se ha podido leer su memoria.',
    you: 'Tú',
    setUpFor: 'Configurado para {name}, en {language}.',
    setUpAgain: 'Configurar de nuevo',
    close: 'Cerrar',
    general: 'General',
    people: 'Personas',
    developer: 'Opciones de desarrollo',
    developerHint:
      'Añade el panel de depuración. Muestra lo que ve, oye y piensa, y te deja mover su cara a mano.',
    developerAlwaysOn: 'Siempre activadas en una versión de desarrollo.',
    openRig: 'Abrir el panel de depuración',
  },
  ja: {
    title: 'せってい',
    sound: 'おと',
    eyeSounds: 'めの おと',
    eyeSoundVolume: 'めの おとの おおきさ',
    voice: 'こえ',
    voiceHint: 'こえを かえると、はなしは さいしょからに なるよ。',
    robot: 'ロボットっぽさ',
    behaviour: 'ふるまい',
    roomSounds: 'へやの おとを きく（おんがく、ノック、なきごえ）',
    speaksUp: 'たいくつ すると じぶんから はなす',
    listensTo: 'だれの こえを きく',
    listensToEveryone: 'はなす ひと みんな',
    listensToButton: 'はなす ボタンだけ',
    listensToHint:
      'ボタンの ときは、ボタンか スペースキーを おしている あいだだけ きこえます。ほかの ひとも はなしている へやで つかってね。これを かえると、はなしは さいしょからに なるよ。',
    holdToTalk: 'おしている あいだ はなせる',
    knowsFaces: 'かおを おぼえる',
    knowsFacesHint:
      'だれかが なまえを いうと、その かおを おぼえて、ひとを みわけます。かおは きおくと いっしょに、この きかいの なかに ほぞんされます。AI サービスには おくりません。なまえだけ おくります。',
    learnMyFace: 'わたしの かおを おぼえる',
    noFaceToLearn: 'かおが よく みえませんでした。カメラを みて、もういちど ためしてください。',
    faceNotYet:
      'かおは みえていますが、まだ よく みえません。すこし ちかづいて、カメラを みて、もういちど ためしてください。',
    knownFaces: 'おぼえている かお',
    knowsNobody: 'まだ だれも いません。',
    memory: 'きおく',
    remembers: '{count}この ことを おぼえているよ。うごいている きかいの なかに あるよ。',
    remembersNothing: 'まだ なにも おぼえていないよ。',
    forget: 'わすれる',
    forgetAll: 'ぜんぶ わすれる',
    forgetAllConfirm: 'もういちど おすと ぜんぶ わすれるよ',
    memoryFault: 'きおくを よめなかったよ。',
    you: 'きみ',
    setUpFor: '{name}の ために、{language}で せっていしたよ。',
    setUpAgain: 'もういちど せっていする',
    close: 'とじる',
    general: 'きほん',
    people: 'ひと',
    developer: 'かいはつしゃ むけ',
    developerHint:
      'デバッグ パネルが つかえるよ。みている もの、きいている もの、かんがえている ことが みえて、かおを てで うごかせるよ。',
    developerAlwaysOn: 'かいはつ ようの ビルドでは いつも オンだよ。',
    openRig: 'デバッグ パネルを ひらく',
  },
};
