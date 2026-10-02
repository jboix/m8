/**
 * The loop keeps every pose finite whatever the tools do between frames, and an
 * expression it is handed fades back to neutral on its own.
 */

import { afterEach, describe, expect, test } from 'bun:test';
import { createBus } from '../bus/bus.ts';
import { createEyesController, type EyesController } from './controller.ts';
import { emotionTargets } from './emotions.ts';
import { createGazeArbiter } from './gaze-arbiter.ts';
import { RIG_PARAM_NAMES } from './rig.ts';
import type { EyeHandles, RigHandles } from './rig-writer.ts';

/** Milliseconds per simulated frame, at 60 Hz. */
const FRAME_MS = 1000 / 60;

/**
 * An eye whose elements accept writes and remember nothing.
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

/** A frame scheduler the test drives by hand. */
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
    /**
     * Run one frame.
     * @param now - The frame's timestamp.
     */
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

/** A rig and the frame scheduler that drives it. */
interface Bench {
  controller: EyesController;
  frames: ReturnType<typeof manualFrames>;
  /**
   * Run frames for a while.
   * @param seconds - How long, in frame time.
   */
  run(seconds: number): void;
}

/**
 * Start a rig on stub elements with a fixed seed.
 *
 * @returns The rig, its scheduler, and a way to let time pass.
 */
function bench(): Bench {
  const frames = manualFrames();
  const bus = createBus();
  let now = 0;
  const controller = createEyesController({
    handles: { left: stubEye(), right: stubEye() } as RigHandles,
    arbiter: createGazeArbiter(bus, { now: () => now }),
    reducedMotion: false,
    seed: 7,
  });
  frames.step(now);
  return {
    controller,
    frames,
    run(seconds) {
      const count = Math.round((seconds * 1000) / FRAME_MS);
      for (let index = 0; index < count; index += 1) {
        now += FRAME_MS;
        frames.step(now);
      }
    },
  };
}

describe('createEyesController', () => {
  let active: Bench | null = null;

  afterEach(() => {
    active?.controller.stop();
    active?.frames.restore();
    active = null;
  });

  test('keeps every parameter finite through a gesture called between frames', () => {
    active = bench();
    const { controller } = active;

    for (const kind of ['wide_eyes', 'squint', 'yawn', 'slow_blink'] as const) {
      controller.controls.gesture(kind);
      active.run(3);
      const pose = controller.inspector.pose();
      for (const name of RIG_PARAM_NAMES) {
        expect(Number.isFinite(pose[name])).toBe(true);
      }
    }
  });

  test('fades an expression back to neutral by itself', () => {
    active = bench();
    const { controller, run } = active;

    controller.controls.setEmotion('thinking', 0.6);
    run(4);
    expect(controller.inspector.expression()).toEqual({ emotion: 'thinking', intensity: 0.6 });

    run(40);
    expect(controller.inspector.expression().intensity).toBe(0);
    const pose = controller.inspector.pose();
    const rest = emotionTargets('neutral', 0);
    expect(pose.leftBrowTilt).toBeCloseTo(rest.leftBrowTilt, 2);
    expect(pose.rightBrowTilt).toBeCloseTo(rest.rightBrowTilt, 2);
  });

  test('keeps sleep until presence ends it', () => {
    active = bench();
    const { controller, run } = active;

    controller.controls.setEmotion('sleepy', 0.85);
    run(120);
    expect(controller.inspector.expression()).toEqual({ emotion: 'sleepy', intensity: 0.85 });
  });
});
