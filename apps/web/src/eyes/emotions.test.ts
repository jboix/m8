/** Presets scale with intensity, stay inside the rig's ranges, and only skeptical-style expressions break symmetry. */

import { describe, expect, test } from 'bun:test';
import { Emotion } from '@m8/shared';
import { EMOTION_PRESETS, emotionTargets, fadedIntensity } from './emotions.ts';
import { RIG_PARAM_NAMES, RIG_REST, rigRange } from './rig.ts';

describe('emotionTargets', () => {
  test('leaves the face at rest at zero intensity', () => {
    for (const emotion of Emotion.options) {
      expect(emotionTargets(emotion, 0)).toEqual({ ...RIG_REST });
    }
  });

  test('blends linearly between rest and the full preset', () => {
    const half = emotionTargets('annoyed', 0.5);
    const full = emotionTargets('annoyed', 1);

    expect(half.leftBrowTilt).toBeCloseTo((RIG_REST.leftBrowTilt + full.leftBrowTilt) / 2, 10);
    expect(half.leftUpperLid).toBeCloseTo((RIG_REST.leftUpperLid + full.leftUpperLid) / 2, 10);
  });

  test('clamps intensity outside zero to one', () => {
    expect(emotionTargets('shocked', 5)).toEqual(emotionTargets('shocked', 1));
    expect(emotionTargets('shocked', -3)).toEqual(emotionTargets('shocked', 0));
  });

  test('keeps every parameter of every preset inside its range', () => {
    for (const emotion of Emotion.options) {
      const pose = emotionTargets(emotion, 1);
      for (const name of RIG_PARAM_NAMES) {
        const { min, max } = rigRange(name);
        expect(pose[name]).toBeGreaterThanOrEqual(min);
        expect(pose[name]).toBeLessThanOrEqual(max);
      }
    }
  });

  test('mirrors the brows onto both eyes unless the preset asks for asymmetry', () => {
    for (const emotion of Emotion.options) {
      const pose = emotionTargets(emotion, 1);
      const asymmetric = (EMOTION_PRESETS[emotion].asymmetry ?? 0) !== 0;

      expect(pose.leftBrowTilt === pose.rightBrowTilt).toBe(!asymmetric);
      expect(pose.leftUpperLid).toBeCloseTo(pose.rightUpperLid, 10);
    }
  });

  test('opens one eye wider than the other only when the preset asks for it', () => {
    for (const emotion of Emotion.options) {
      const pose = emotionTargets(emotion, 1);
      const skewed = (EMOTION_PRESETS[emotion].sizeSkew ?? 0) !== 0;

      expect(pose.leftPupil === pose.rightPupil).toBe(!skewed);
    }
  });

  test('curious is asymmetric in size, not tilt', () => {
    const pose = emotionTargets('curious', 1);

    expect(pose.rightPupil).toBeGreaterThan(pose.leftPupil);
    expect(pose.leftBrowTilt).toBe(pose.rightBrowTilt);
  });

  test('skeptical frowns with both eyes, one more than the other, and looks up', () => {
    const pose = emotionTargets('skeptical', 1);

    expect(pose.leftBrowTilt).toBeLessThan(0);
    expect(pose.rightBrowTilt).toBeLessThan(0);
    expect(pose.leftBrowTilt).toBeLessThan(pose.rightBrowTilt);
    expect(pose.leftPupil).toBe(pose.rightPupil);
    expect(pose.gazeY).toBeLessThan(0);
  });

  test('happy smiles from below without shutting the eyes', () => {
    const pose = emotionTargets('happy', 1);

    expect(pose.leftSmile).toBeGreaterThan(0.5);
    expect(pose.leftLowerLid).toBeLessThan(0.1);
    expect(pose.leftUpperLid).toBeLessThan(0.1);
  });

  test('never moves horizontal gaze, which belongs to the gaze arbiter', () => {
    for (const emotion of Emotion.options) {
      expect(emotionTargets(emotion, 1).gazeX).toBe(RIG_REST.gazeX);
    }
  });

  test('gives every emotion but neutral a distinguishable pose', () => {
    const poses = Emotion.options.map((emotion) => JSON.stringify(emotionTargets(emotion, 1)));

    expect(new Set(poses).size).toBe(Emotion.options.length);
  });
});

describe('fadedIntensity', () => {
  test('holds the full intensity at first', () => {
    expect(fadedIntensity('curious', 0.6, 0)).toBe(0.6);
    expect(fadedIntensity('curious', 0.6, 5)).toBe(0.6);
  });

  test('drops to nothing in one step at the end of the hold', () => {
    expect(fadedIntensity('curious', 0.6, 5.99)).toBe(0.6);
    expect(fadedIntensity('curious', 0.6, 6)).toBe(0);
    expect(fadedIntensity('curious', 0.6, 60)).toBe(0);
  });

  test('never rises while it fades', () => {
    let previous = fadedIntensity('annoyed', 1, 0);
    for (let age = 0.5; age < 40; age += 0.5) {
      const next = fadedIntensity('annoyed', 1, age);
      expect(next).toBeLessThanOrEqual(previous);
      previous = next;
    }
  });

  test('never fades sleep, which presence ends', () => {
    expect(fadedIntensity('sleepy', 0.85, 600)).toBe(0.85);
  });
});
