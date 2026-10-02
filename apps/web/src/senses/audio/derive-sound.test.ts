/**
 * Turning a second of scores into an event, or into nothing at all.
 *
 * The classifier says the same thing every second for as long as a sound lasts.
 * Everything here is about the difference between a sound starting and a sound
 * continuing, which is the only difference the character cares about.
 */
import { describe, expect, test } from 'bun:test';
import { deriveSound, type Heard, newHearingMemory } from './derive-sound.ts';
import { groupOf, isSpeech, SOUND_PHRASES } from './sound-labels.ts';
import type { AmbientWindow } from './windows.ts';

/** A quiet window at a given moment, so the loudness path stays out of the way. */
function quiet(ts: number): AmbientWindow {
  return { samples: new Float32Array(0), db: -60, ts };
}

/** A window loud enough to be a bang. */
function bang(ts: number): AmbientWindow {
  return { samples: new Float32Array(0), db: -5, ts };
}

/** One classifier result. */
function heard(label: string, score: number): Heard[] {
  return [{ label, score }];
}

describe('what the character has a word for', () => {
  test('a bark and a howl are both just a dog', () => {
    expect(groupOf('Bark')).toBe('a dog');
    expect(groupOf('Howl')).toBe('a dog');
  });

  test('most of audioset is not worth a remark', () => {
    expect(groupOf('Inside, small room')).toBeNull();
    expect(groupOf('Silence')).toBeNull();
  });

  test('speech is recognised so it can be thrown away', () => {
    expect(isSpeech('Speech')).toBe(true);
    expect(isSpeech('Speech synthesizer')).toBe(true);
    expect(isSpeech('Music')).toBe(false);
  });

  test('every phrase reads after "you can hear"', () => {
    // The templates put it there, and "you can hear Dog" would be a bug.
    for (const phrase of SOUND_PHRASES) expect(phrase).toBe(phrase.toLowerCase());
  });
});

describe('a sound starting', () => {
  test('music is announced once', () => {
    const memory = newHearingMemory();
    const first = deriveSound(quiet(1000), heard('Music', 0.8), memory);
    expect(first).toEqual([{ type: 'sound.class', ts: 1000, label: 'music', confidence: 0.8 }]);
  });

  test('and not again a second later, because it is the same music', () => {
    const memory = newHearingMemory();
    deriveSound(quiet(1000), heard('Music', 0.8), memory);
    for (let ts = 2000; ts <= 30_000; ts += 1000) {
      expect(deriveSound(quiet(ts), heard('Music', 0.8), memory)).toEqual([]);
    }
  });

  test('but is announced again once it has actually stopped', () => {
    const memory = newHearingMemory();
    deriveSound(quiet(1000), heard('Music', 0.8), memory);
    const later = deriveSound(quiet(20_000), heard('Music', 0.8), memory);
    expect(later).toHaveLength(1);
  });

  test('a guess below the floor is not a sound', () => {
    const memory = newHearingMemory();
    expect(deriveSound(quiet(1000), heard('Music', 0.3), memory)).toEqual([]);
  });

  test('speech never becomes an event, however sure the classifier is', () => {
    const memory = newHearingMemory();
    expect(deriveSound(quiet(1000), heard('Speech', 0.99), memory)).toEqual([]);
  });

  test('the loudest thing in the window wins', () => {
    const memory = newHearingMemory();
    const events = deriveSound(
      quiet(1000),
      [
        { label: 'Music', score: 0.5 },
        { label: 'Bark', score: 0.9 },
      ],
      memory,
    );
    expect(events[0]).toMatchObject({ label: 'a dog' });
  });
});

describe('a bang', () => {
  test('a jump above the room is one', () => {
    const memory = newHearingMemory();
    deriveSound(quiet(1000), [], memory);
    const events = deriveSound(bang(2000), [], memory);
    expect(events).toEqual([{ type: 'sound.loud', ts: 2000, db: -5 }]);
  });

  test('a room that is simply loud is not', () => {
    const memory = newHearingMemory();
    // Music already playing when the page loads. The first window sets the
    // floor, and nothing after it is a surprise.
    const events = [];
    for (let ts = 1000; ts <= 30_000; ts += 1000) events.push(...deriveSound(bang(ts), [], memory));
    expect(events.filter((event) => event.type === 'sound.loud')).toEqual([]);
  });

  test('and stops being one the moment it stops being sudden', () => {
    const memory = newHearingMemory();
    deriveSound(quiet(1000), [], memory);
    const fires = [];
    for (let ts = 2000; ts <= 12_000; ts += 1000) {
      fires.push(...deriveSound(bang(ts), [], memory).filter((e) => e.type === 'sound.loud'));
    }
    expect(fires).toHaveLength(1);
  });

  test('the very first window is never one, whatever the room sounds like', () => {
    const memory = newHearingMemory();
    expect(deriveSound(bang(1000), [], memory)).toEqual([]);
  });

  test('one door closing is one event, not three', () => {
    const memory = newHearingMemory();
    deriveSound(quiet(1000), [], memory);
    expect(deriveSound(bang(2000), [], memory)).toHaveLength(1);
    expect(deriveSound(bang(2500), [], memory)).toHaveLength(0);
  });

  test('a slam is both a bang and a door, and both are true', () => {
    const memory = newHearingMemory();
    deriveSound(quiet(1000), [], memory);
    const events = deriveSound(bang(2000), heard('Slam', 0.7), memory);
    expect(events.map((event) => event.type)).toEqual(['sound.loud', 'sound.class']);
  });
});
