/**
 * Says a mood in words. The four numbers mean nothing to a speech model, and
 * "you were bored and a bit put out" does.
 */
import type { Mood } from '@m8/shared';

/** One thing worth saying about a mood, and when it applies. */
interface MoodWord {
  /** What it is called. */
  word: string;
  /**
   * Whether it applies.
   * @param mood - The mood.
   * @returns True when the mood is far enough from rest to be worth saying.
   */
  applies: (mood: Mood) => boolean;
}

/** Everything that can be said, strongest feelings first. Rest is none of them. */
const WORDS: readonly MoodWord[] = [
  { word: 'in a really good mood', applies: (mood) => mood.valence >= 0.75 },
  { word: 'a bit put out', applies: (mood) => mood.valence <= 0.4 },
  { word: 'bored', applies: (mood) => mood.boredom >= 0.5 },
  { word: 'wound up', applies: (mood) => mood.arousal >= 0.55 },
  { word: 'curious about something', applies: (mood) => mood.curiosity >= 0.6 },
];

/**
 * Describe a mood.
 *
 * @param mood - The four values.
 * @returns The feelings that apply, joined with `and`, or null when he felt
 * nothing in particular.
 */
export function moodInWords(mood: Mood): string | null {
  const words = WORDS.filter((entry) => entry.applies(mood)).map((entry) => entry.word);
  return words.length === 0 ? null : words.join(' and ');
}
