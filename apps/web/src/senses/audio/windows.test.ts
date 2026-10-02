/**
 * Cutting the microphone into the lengths YAMNet scores.
 *
 * The worklet hands over 128 samples at a time and the model wants 15,600, so
 * the only thing that can go wrong here is losing or duplicating samples across
 * a boundary. Everything else about the raw track needs a browser.
 */
import { describe, expect, test } from 'bun:test';
import { AMBIENT_WINDOW, type AmbientWindow, loudness, windower } from './windows.ts';

describe('collecting frames into windows', () => {
  test('nothing comes out until a window is full', () => {
    const windows: AmbientWindow[] = [];
    const feed = windower((window) => windows.push(window));
    for (let i = 0; i < 100; i += 1) feed(new Float32Array(128));
    expect(windows).toHaveLength(0);
  });

  test('a window comes out with every sample in order', () => {
    const windows: AmbientWindow[] = [];
    const feed = windower((window) => windows.push(window));
    let sample = 0;
    while (windows.length === 0) {
      const frame = new Float32Array(128);
      for (let i = 0; i < frame.length; i += 1) frame[i] = sample++ / 1e6;
      feed(frame);
    }
    const first = windows[0]?.samples;
    expect(first).toHaveLength(AMBIENT_WINDOW);
    expect(first?.[0]).toBeCloseTo(0, 9);
    expect(first?.[AMBIENT_WINDOW - 1]).toBeCloseTo((AMBIENT_WINDOW - 1) / 1e6, 9);
  });

  test('a frame that straddles the boundary is not lost', () => {
    const windows: AmbientWindow[] = [];
    const feed = windower((window) => windows.push(window));
    // One oversized frame covering two and a bit windows, which is what a
    // different worklet buffer size would look like.
    const frame = new Float32Array(AMBIENT_WINDOW * 2 + 40);
    frame.fill(0.5);
    feed(frame);
    expect(windows).toHaveLength(2);
    expect(windows[1]?.samples.every((value) => value === 0.5)).toBe(true);
  });

  test('each window carries its own moment, not the one before', () => {
    const windows: AmbientWindow[] = [];
    const feed = windower((window) => windows.push(window));
    feed(new Float32Array(AMBIENT_WINDOW * 2));
    expect(windows[1]?.ts).toBeGreaterThanOrEqual(windows[0]?.ts ?? 0);
  });
});

describe('how loud a window was', () => {
  test('silence is the floor rather than negative infinity', () => {
    expect(loudness(new Float32Array(128))).toBe(-100);
  });

  test('a full scale tone is about zero', () => {
    const full = new Float32Array(128).fill(1);
    expect(loudness(full)).toBeCloseTo(0, 5);
  });

  test('halving the amplitude costs about six decibels', () => {
    const loud = new Float32Array(128).fill(0.5);
    const quiet = new Float32Array(128).fill(0.25);
    expect(loudness(loud) - loudness(quiet)).toBeCloseTo(6.02, 1);
  });
});
