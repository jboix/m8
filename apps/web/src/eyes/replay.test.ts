/**
 * A recorded session replays and drives the eyes identically. "Identically" is only meaningful if the randomness and the frame
 * timing are pinned too, so this runs the whole rig twice from the same seed,
 * the same events and the same frame schedule, and compares every pose.
 */

import { describe, expect, test } from 'bun:test';
import type { Recording, SenseEvent } from '@m8/shared';
import { createBus } from '../bus/bus.ts';
import { createEyesController } from './controller.ts';
import { createGazeArbiter } from './gaze-arbiter.ts';
import type { RigParams } from './rig.ts';
import type { EyeHandles, RigHandles } from './rig-writer.ts';

/** Seconds per simulated frame. 60 Hz, exactly, on both runs. */
const FRAME_MS = 1000 / 60;

/**
 * An eye whose elements accept writes and remember nothing. What the rig
 * produces is the pose; the DOM is only where it is drawn.
 *
 * @returns The four stub parts one eye is written through.
 */
function stubEye(): EyeHandles {
  const element = () => ({ setAttribute: () => {} }) as unknown as SVGGElement;
  return {
    group: element(),
    shape: element() as unknown as SVGPathElement,
    glow: element() as unknown as SVGPathElement,
    highlight: element() as unknown as SVGRectElement,
  };
}

/** A frame scheduler a test drives by hand. */
function manualFrames() {
  let pending: ((now: number) => void) | null = null;
  const previousRequest = globalThis.requestAnimationFrame;
  const previousCancel = globalThis.cancelAnimationFrame;

  globalThis.requestAnimationFrame = (callback: FrameRequestCallback) => {
    pending = callback;
    return 1;
  };
  globalThis.cancelAnimationFrame = () => {
    pending = null;
  };

  return {
    /** Run one frame at `now`. */
    step(now: number) {
      const callback = pending;
      pending = null;
      callback?.(now);
    },
    restore() {
      globalThis.requestAnimationFrame = previousRequest;
      globalThis.cancelAnimationFrame = previousCancel;
    },
  };
}

/**
 * Run a whole session and collect every pose it passed through.
 *
 * @param recording - The events to replay, on their own timestamps.
 * @param frames - How many frames to run.
 * @returns One pose per frame.
 */
function runSession(recording: Recording, frames: number): RigParams[] {
  const clock = manualFrames();
  const bus = createBus();
  let at = 0;
  const arbiter = createGazeArbiter(bus, { now: () => at });
  const controller = createEyesController({
    handles: { left: stubEye(), right: stubEye() } as RigHandles,
    arbiter,
    reducedMotion: false,
    seed: recording.seed,
  });

  const poses: RigParams[] = [];
  let next = 0;
  for (let frame = 0; frame < frames; frame++) {
    at = frame * FRAME_MS;
    // Everything that happened before this frame arrives before it is drawn,
    // which is what a real bus does between two animation frames.
    while (recording.events[next] && (recording.events[next]?.ts ?? 0) <= at) {
      const event = recording.events[next];
      if (event) bus.publish(event);
      next += 1;
    }
    clock.step(at);
    poses.push(controller.inspector.pose());
  }

  controller.stop();
  clock.restore();
  return poses;
}

/**
 * A minute of someone moving about in front of the character.
 *
 * @param seed - The seed to record against.
 * @returns The recording.
 */
function aSession(seed: number): Recording {
  const events: SenseEvent[] = [];
  for (let step = 0; step < 40; step++) {
    const ts = step * 120;
    events.push({
      type: 'vision.face',
      ts,
      id: 'p',
      x: 0.5 + Math.sin(step / 3) * 0.4,
      y: 0.5 + Math.cos(step / 5) * 0.3,
      size: 0.3,
      facing: true,
    });
    if (step % 11 === 0) {
      events.push({ type: 'vision.motion', ts: ts + 10, x: 0.9, y: 0.2, magnitude: 0.7 });
    }
  }
  return { version: 1, label: 'test', recordedAt: 0, seed, events };
}

describe('replaying a recording', () => {
  test('drives the eyes identically', () => {
    const recording = aSession(20260919);

    const first = runSession(recording, 400);
    const second = runSession(recording, 400);

    expect(second).toEqual(first);
  });

  test('drives them differently from a different seed', () => {
    const first = runSession(aSession(1), 400);
    const second = runSession(aSession(2), 400);

    expect(second).not.toEqual(first);
  });

  test('actually moves the eyes, so the comparison is not of two still faces', () => {
    const poses = runSession(aSession(5), 400);
    const spread = poses.map((pose) => pose.gazeX);

    expect(Math.max(...spread) - Math.min(...spread)).toBeGreaterThan(0.5);
  });

  test('blinks during the session, so the seeded brainstem is in the comparison', () => {
    const poses = runSession(aSession(5), 900);

    expect(Math.max(...poses.map((pose) => pose.leftUpperLid))).toBeGreaterThan(0.3);
  });
});
