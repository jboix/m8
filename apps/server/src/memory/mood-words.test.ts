/** A mood, said in words. */
import { describe, expect, test } from 'bun:test';
import { moodInWords } from './mood-words.ts';

/** Where the mood settles when nothing is happening. */
const REST = { arousal: 0.25, curiosity: 0.4, boredom: 0.15, valence: 0.55 };

describe('moodInWords', () => {
  test('has nothing to say about a mood at rest', () => {
    expect(moodInWords(REST)).toBeNull();
  });

  test('names every feeling that is far enough from rest', () => {
    expect(moodInWords({ ...REST, valence: 0.3, boredom: 0.8 })).toBe('a bit put out and bored');
    expect(moodInWords({ ...REST, valence: 0.9 })).toBe('in a really good mood');
  });
});
