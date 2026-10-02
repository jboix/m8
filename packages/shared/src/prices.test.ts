/** The price table finds the right model and period, and a call costs what the page says. */
import { describe, expect, test } from 'bun:test';
import { costOf, priceOf } from './prices.ts';
import { NO_TOKENS } from './usage.ts';

/** A time inside the first period of every model in the table. */
const NOW = Date.parse('2026-10-02T12:00:00Z');

describe('priceOf', () => {
  test('matches a longer key before a shorter prefix of it', () => {
    expect(priceOf('gemini-3.5-flash-lite', NOW)?.input.text).toBe(0.3);
    expect(priceOf('gemini-3.5-flash', NOW)?.input.text).toBe(1.5);
  });

  test('strips a leading models/', () => {
    expect(priceOf('models/gemini-3.8-live', NOW)?.output.audio).toBe(12);
  });

  test('covers a dated version of a model with its prefix key', () => {
    const price = priceOf('gemini-2.5-flash-native-audio-preview-09-2025', NOW);
    expect(price?.input).toEqual({ text: 0.5, audio: 3, image: 3 });
  });

  test('gives null for a model not in the table', () => {
    expect(priceOf('gemini-9-ultra', NOW)).toBeNull();
    expect(priceOf('gemini-3.8-flashy', NOW)).toBeNull();
  });

  test('changes the period at midnight UTC on its first day', () => {
    expect(priceOf('gemini-3.8-flash', Date.parse('2026-12-31T23:00:00Z'))?.input.text).toBe(0.75);
    expect(priceOf('gemini-3.8-flash', Date.parse('2027-01-01T00:00:00Z'))?.input.text).toBe(1.5);
  });

  test('falls back to the fresh price where no cache price is listed', () => {
    expect(priceOf('gemini-3.8-live', NOW)?.cached).toEqual({ text: 0.75, audio: 3, image: 1 });
  });
});

describe('costOf', () => {
  test('costs a live turn by modality, with thinking as text output', () => {
    const counts = {
      ...NO_TOKENS,
      inputText: 1500,
      inputAudio: 300,
      inputImage: 256,
      outputAudio: 90,
      thinking: 70,
    };
    // 1500 x 0.75 + 300 x 3 + 256 x 1 + 90 x 12 + 70 x 4.5 = 1125 + 900 + 256 + 1080 + 315.
    expect(costOf('gemini-3.8-live', counts, NOW)).toEqual({ costMicros: 3676, savedMicros: 0 });
  });

  test('charges cached tokens at the cached price and reports the saving', () => {
    const counts = { ...NO_TOKENS, inputText: 1000, cachedText: 4000, outputText: 200 };
    // 1000 x 0.75 + 4000 x 0.075 + 200 x 3.75 = 750 + 300 + 750. Saved: 4000 x 0.675.
    expect(costOf('gemini-3.8-flash', counts, NOW)).toEqual({
      costMicros: 1800,
      savedMicros: 2700,
    });
  });

  test('saves nothing on a model with no cache price', () => {
    const counts = { ...NO_TOKENS, cachedText: 1000 };
    expect(costOf('gemini-3.5-flash-lite', counts, NOW)).toEqual({
      costMicros: 300,
      savedMicros: 0,
    });
  });

  test('rounds to whole micros', () => {
    const cost = costOf('gemini-3.8-flash', { ...NO_TOKENS, inputText: 1, cachedText: 3 }, NOW);
    // 1 x 0.75 + 3 x 0.075 = 0.975. Saved: 3 x 0.675 = 2.025.
    expect(cost).toEqual({ costMicros: 1, savedMicros: 2 });
    expect(Number.isInteger(cost?.costMicros)).toBe(true);
  });

  test('gives null for a model with no price', () => {
    expect(costOf('gemini-9-ultra', NO_TOKENS, NOW)).toBeNull();
  });
});
