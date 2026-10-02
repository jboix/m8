/**
 * The reflexes: what the face does before any model is consulted. A double take
 * at a wave, and nodding off by stages when left alone. They never
 * choose an emotion other than sleep.
 */

import { describe, expect, test } from 'bun:test';
import type { Emotion, GazeTarget, GestureKind } from '@m8/shared';
import { createBus } from '../bus/bus.ts';
import type { EyesControls } from './controller.ts';
import { startReflexes } from './reflexes.ts';

/** A rig that only writes down what it was asked to do. */
function spyControls() {
  const emotions: { emotion: Emotion; intensity: number }[] = [];
  const gestures: GestureKind[] = [];
  const looks: GazeTarget[] = [];
  const controls: EyesControls = {
    lookAt: (target) => {
      looks.push(target);
    },
    setEmotion: (emotion, intensity = 0.6) => {
      emotions.push({ emotion, intensity });
    },
    gesture: (kind) => {
      gestures.push(kind);
    },
  };
  return { controls, emotions, gestures, looks };
}

describe('the reflexes', () => {
  test('leave the expression alone, whatever face you pull', () => {
    const bus = createBus();
    const spy = spyControls();
    startReflexes(bus, spy.controls);

    for (const kind of ['smile', 'surprise', 'frown', 'talking'] as const) {
      bus.publish({ type: 'vision.expression', ts: 0, id: 'face', kind });
    }

    expect(spy.emotions).toEqual([]);
  });

  test('glances twice at a wave', () => {
    const bus = createBus();
    const spy = spyControls();
    startReflexes(bus, spy.controls);

    bus.publish({ type: 'vision.gesture', ts: 0, kind: 'wave' });

    expect(spy.gestures).toEqual(['double_take']);
  });

  test('does not react to a gesture it has no reflex for', () => {
    const bus = createBus();
    const spy = spyControls();
    startReflexes(bus, spy.controls);

    bus.publish({ type: 'vision.gesture', ts: 0, kind: 'thumbs_up' });

    expect(spy.gestures).toEqual([]);
  });
});

describe('being left alone', () => {
  test('looks for them first, and does not get sleepy yet', () => {
    const bus = createBus();
    const spy = spyControls();
    startReflexes(bus, spy.controls);

    bus.publish({ type: 'presence', ts: 0, state: 'absent' });
    bus.publish({ type: 'alone', ts: 0, stage: 'looking' });

    expect(spy.looks).toEqual(['around']);
    expect(spy.emotions).toEqual([]);
  });

  test('nods off by stages: a yawn, a slow blink, then asleep', () => {
    const bus = createBus();
    const spy = spyControls();
    startReflexes(bus, spy.controls);

    for (const stage of ['looking', 'drowsy', 'dozing', 'asleep'] as const) {
      bus.publish({ type: 'alone', ts: 0, stage });
    }

    expect(spy.emotions.map((set) => set.intensity)).toEqual([0.35, 0.6, 0.85]);
    expect(spy.gestures).toEqual(['yawn', 'slow_blink']);
  });

  test('comes round when someone walks in', () => {
    const bus = createBus();
    const spy = spyControls();
    startReflexes(bus, spy.controls);

    bus.publish({ type: 'alone', ts: 0, stage: 'drowsy' });
    bus.publish({ type: 'presence', ts: 1, state: 'present' });

    expect(spy.emotions.at(-1)).toEqual({ emotion: 'neutral', intensity: 0 });
    expect(spy.gestures).toEqual(['yawn', 'wide_eyes']);
  });

  test('does not startle when they come back before he got sleepy', () => {
    const bus = createBus();
    const spy = spyControls();
    startReflexes(bus, spy.controls);

    bus.publish({ type: 'alone', ts: 0, stage: 'looking' });
    bus.publish({ type: 'presence', ts: 1, state: 'present' });

    expect(spy.emotions).toEqual([]);
    expect(spy.gestures).toEqual([]);
  });

  test('ignores a wave once he is sleepy', () => {
    const bus = createBus();
    const spy = spyControls();
    startReflexes(bus, spy.controls);

    bus.publish({ type: 'alone', ts: 0, stage: 'asleep' });
    bus.publish({ type: 'vision.gesture', ts: 1, kind: 'wave' });

    expect(spy.gestures).toEqual([]);
  });

  test('stops reacting once stopped', () => {
    const bus = createBus();
    const spy = spyControls();
    const reflexes = startReflexes(bus, spy.controls);

    reflexes.stop();
    bus.publish({ type: 'alone', ts: 0, stage: 'asleep' });

    expect(spy.emotions).toEqual([]);
  });
});
