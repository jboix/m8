/**
 * Which of YAMNet's five hundred and twenty-one classes the character cares
 * about, and what it would call them.
 *
 * Two jobs, and they are separate on purpose:
 *
 * **The whitelist.** Most of AudioSet is not worth a remark. "Inside, small
 * room", "Silence", "Sound effect" and several hundred others are either always
 * true, useless, or wrong often enough to be annoying. Only what is listed here
 * ever reaches the bus.
 *
 * **The grouping.** YAMNet distinguishes a bark from a howl from a growl. The
 * character does not: it hears a dog. Grouping matters more than it looks,
 * because the group is what habituation counts against in `fusion/weights.ts`.
 * Ungrouped, a dog that barks then howls then whines reads as three new things
 * and gets reacted to three times.
 */

/** A group of classes, and the phrase the character uses for it. */
interface Group {
  /** What it says. Reads after "you can hear". */
  phrase: string;
  /** The YAMNet class names that mean it. */
  classes: string[];
}

/**
 * Everything worth noticing, grouped.
 *
 * Class names are AudioSet's own, spelled as YAMNet emits them, commas and all.
 */
const GROUPS: Group[] = [
  {
    phrase: 'music',
    classes: ['Music', 'Musical instrument', 'Singing', 'Guitar', 'Piano', 'Drum kit', 'Bass drum'],
  },
  { phrase: 'a dog', classes: ['Dog', 'Bark', 'Howl', 'Growling', 'Whimper (dog)'] },
  { phrase: 'a cat', classes: ['Cat', 'Meow', 'Purr', 'Caterwaul'] },
  {
    phrase: 'a bird outside',
    classes: ['Bird', 'Bird vocalization, bird call, bird song', 'Chirp, tweet'],
  },
  { phrase: 'a knock at the door', classes: ['Knock', 'Door', 'Doorbell', 'Ding-dong', 'Slam'] },
  { phrase: 'someone laughing', classes: ['Laughter', 'Giggle', 'Chuckle, chortle', 'Snicker'] },
  {
    phrase: 'an alarm going off',
    classes: [
      'Alarm',
      'Alarm clock',
      'Siren',
      'Smoke detector, smoke alarm',
      'Buzzer',
      'Fire alarm',
    ],
  },
  { phrase: 'a phone ringing', classes: ['Telephone bell ringing', 'Ringtone', 'Telephone'] },
  { phrase: 'typing', classes: ['Typing', 'Computer keyboard', 'Typewriter'] },
  { phrase: 'clapping', classes: ['Applause', 'Clapping', 'Cheering'] },
  { phrase: 'a baby crying', classes: ['Baby cry, infant cry', 'Crying, sobbing', 'Babbling'] },
  { phrase: 'someone coughing', classes: ['Cough', 'Sneeze', 'Throat clearing', 'Sniff'] },
  { phrase: 'whistling', classes: ['Whistling', 'Whistle'] },
  {
    phrase: 'running water',
    classes: ['Water', 'Water tap, faucet', 'Sink (filling or washing)', 'Pour'],
  },
  {
    phrase: 'traffic',
    classes: ['Vehicle', 'Car', 'Motorcycle', 'Traffic noise, roadway noise', 'Car passing by'],
  },
  { phrase: 'a vacuum cleaner', classes: ['Vacuum cleaner', 'Blender', 'Mechanical fan'] },
  { phrase: 'a television', classes: ['Television', 'Radio'] },
  { phrase: 'something break', classes: ['Glass', 'Shatter', 'Breaking', 'Crash'] },
  { phrase: 'keys jingling', classes: ['Jingle, tinkle', 'Coin (dropping)'] },
  { phrase: 'footsteps', classes: ['Walk, footsteps', 'Run'] },
];

/**
 * Speech, in all the forms YAMNet reports it.
 *
 * Never a `sound.class` event, whoever is talking. When it is the person, the
 * processed track already carries their actual words to the model, and "you can
 * hear speech" alongside the sentence itself is noise. When it is the
 * character, it is the character.
 */
const SPEECH = new Set([
  'Speech',
  'Male speech, man speaking',
  'Female speech, woman speaking',
  'Child speech, kid speaking',
  'Conversation',
  'Narration, monologue',
  'Speech synthesizer',
  'Whispering',
  'Shout',
  'Yell',
  'Children shouting',
  'Hubbub, speech noise, speech babble',
]);

/** Class name to phrase, flattened once at module load. */
const PHRASE = new Map<string, string>(
  GROUPS.flatMap((group) => group.classes.map((name) => [name, group.phrase] as const)),
);

/** Every phrase, for tests and for the debug panel's legend. */
export const SOUND_PHRASES: string[] = GROUPS.map((group) => group.phrase);

/**
 * Whether a class name is speech of any kind.
 *
 * @param name - The YAMNet class name.
 * @returns True when it is somebody talking.
 */
export function isSpeech(name: string): boolean {
  return SPEECH.has(name);
}

/**
 * What the character would call a class.
 *
 * @param name - The YAMNet class name.
 * @returns The phrase, or `null` when this is not something it remarks on.
 */
export function groupOf(name: string): string | null {
  return PHRASE.get(name) ?? null;
}
