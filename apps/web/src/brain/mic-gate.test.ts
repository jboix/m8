import { describe, expect, test } from 'bun:test';
import { ECHO_WARMUP_MS, heldFrame, type VoiceState } from './mic-gate.ts';

/**
 * A voice in a given state.
 *
 * @param speaking - Whether it is playing.
 * @param spokenMs - How long it has played in total.
 * @returns The voice.
 */
function voice(speaking: boolean, spokenMs: number): VoiceState {
  return { speaking: () => speaking, spokenMs: () => spokenMs };
}

describe('the microphone gate, with everyone marking the turns', () => {
  const listening = 'everyone';

  test('lets everything through while he is quiet', () => {
    expect(
      heldFrame({ listening, talking: false, voice: voice(false, 0), halfDuplex: false }),
    ).toBe(false);
    expect(heldFrame({ listening, talking: false, voice: null, halfDuplex: true })).toBe(false);
  });

  test('holds the microphone until the canceller has heard enough of him', () => {
    const early = voice(true, ECHO_WARMUP_MS - 1);
    const late = voice(true, ECHO_WARMUP_MS);
    expect(heldFrame({ listening, talking: false, voice: early, halfDuplex: false })).toBe(true);
    expect(heldFrame({ listening, talking: false, voice: late, halfDuplex: false })).toBe(false);
  });

  test('holds it for the whole utterance in half duplex', () => {
    const late = voice(true, ECHO_WARMUP_MS * 4);
    expect(heldFrame({ listening, talking: false, voice: late, halfDuplex: true })).toBe(true);
  });
});

describe('the microphone gate, with the button marking the turns', () => {
  const listening = 'button';

  test('is the button, and nothing else', () => {
    const speaking = voice(true, 0);
    expect(heldFrame({ listening, talking: true, voice: speaking, halfDuplex: true })).toBe(false);
    expect(heldFrame({ listening, talking: false, voice: null, halfDuplex: false })).toBe(true);
  });
});
