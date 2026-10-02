import { describe, expect, test } from 'bun:test';
import { measureSound } from './level.ts';

/**
 * A sine wave.
 *
 * @param cycles - How many cycles fit in the stretch.
 * @param amplitude - Its peak, 0 to 1.
 * @returns 1600 samples of it.
 */
function sine(cycles: number, amplitude: number): Float32Array {
  const samples = new Float32Array(1600);
  for (let index = 0; index < samples.length; index += 1) {
    samples[index] = amplitude * Math.sin((2 * Math.PI * cycles * index) / samples.length);
  }
  return samples;
}

describe('measuring a sound', () => {
  test('silence and room noise measure as nothing', () => {
    expect(measureSound(new Float32Array(1600), 1)).toEqual({ level: 0, brightness: 0 });
    expect(measureSound(sine(20, 0.01), 1).level).toBe(0);
  });

  test('louder is louder, up to one', () => {
    const quiet = measureSound(sine(20, 0.05), 1).level;
    const loud = measureSound(sine(20, 0.2), 1).level;
    expect(loud).toBeGreaterThan(quiet);
    expect(measureSound(sine(20, 1), 1).level).toBe(1);
  });

  test('a hiss is brighter than a hum', () => {
    const hum = measureSound(sine(15, 0.2), 1).brightness;
    const hiss = measureSound(sine(300, 0.2), 1).brightness;
    expect(hiss).toBeGreaterThan(hum);
  });

  test('PCM16 measures the same as the floats it came from', () => {
    const floats = sine(40, 0.2);
    const pcm = Int16Array.from(floats, (sample) => Math.round(sample * 32767));
    expect(measureSound(pcm, 32768).level).toBeCloseTo(measureSound(floats, 1).level, 2);
  });
});
