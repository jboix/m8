/** The three claims on the gaze, and which of them wins. */

import { describe, expect, test } from 'bun:test';
import type { SenseEvent } from '@m8/shared';
import { createBus } from '../bus/bus.ts';
import { createGazeArbiter } from './gaze-arbiter.ts';

/** A clock a test can wind forward. */
function fakeClock() {
  let at = 0;
  return {
    now: () => at,
    advance(ms: number) {
      at += ms;
    },
  };
}

/**
 * A face event at a normalised position.
 *
 * @param ts - When.
 * @param x - Across, 0 to 1.
 * @param y - Down, 0 to 1.
 * @returns The event.
 */
function face(ts: number, x: number, y: number, id = 'p'): SenseEvent {
  return { type: 'vision.face', ts, id, x, y, size: 0.3, facing: true };
}

describe('the gaze arbiter', () => {
  test('wanders when nothing is claiming', () => {
    const clock = fakeClock();
    const arbiter = createGazeArbiter(createBus(), { now: clock.now });

    expect(arbiter.read()).toBeNull();
    expect(arbiter.winner()).toBeNull();
  });

  test('tracks a face, converting to the rig coordinates', () => {
    const clock = fakeClock();
    const bus = createBus();
    const arbiter = createGazeArbiter(bus, { now: clock.now });

    for (let step = 0; step < 12; step++) bus.publish(face(step, 1, 0));

    expect(arbiter.winner()).toBe('track');
    expect(arbiter.read()?.x).toBeCloseTo(1, 2);
    expect(arbiter.read()?.y).toBeCloseTo(-1, 2);
  });

  test('eases onto a face rather than snapping, because the nose tip jitters', () => {
    const clock = fakeClock();
    const bus = createBus();
    const arbiter = createGazeArbiter(bus, { now: clock.now });

    bus.publish(face(0, 0.5, 0.5));
    bus.publish(face(1, 1, 0.5));
    const first = arbiter.read()?.x ?? 0;

    expect(first).toBeGreaterThan(0);
    expect(first).toBeLessThan(1);
  });

  test('looks straight ahead at a face dead centre', () => {
    const clock = fakeClock();
    const bus = createBus();
    const arbiter = createGazeArbiter(bus, { now: clock.now });

    bus.publish(face(0, 0.5, 0.5));

    expect(arbiter.read()).toEqual({ x: 0, y: 0 });
  });

  test('exaggerates a face that only moved across the middle of the frame', () => {
    const clock = fakeClock();
    const bus = createBus();
    const arbiter = createGazeArbiter(bus, { now: clock.now });

    // Someone at a desk leaning right: two thirds across, never near the edge.
    for (let step = 0; step < 12; step++) bus.publish(face(step, 0.66, 0.5));
    const looked = arbiter.read();

    // Without the gain this would be 0.32, which barely moves the eyes.
    expect(looked?.x).toBeGreaterThan(0.6);
    expect(looked?.x).toBeLessThanOrEqual(1);
  });

  test('lets go of a face that stops arriving', () => {
    const clock = fakeClock();
    const bus = createBus();
    const arbiter = createGazeArbiter(bus, { now: clock.now });

    bus.publish(face(0, 0.5, 0.5));
    clock.advance(1201);

    expect(arbiter.read()).toBeNull();
  });

  test('lets go at once when the face is reported lost', () => {
    const clock = fakeClock();
    const bus = createBus();
    const arbiter = createGazeArbiter(bus, { now: clock.now });

    bus.publish(face(0, 0.5, 0.5));
    bus.publish({ type: 'vision.face.lost', ts: 1, id: 'p' });

    expect(arbiter.read()).toBeNull();
  });

  test('sends the model to the face it is actually tracking', () => {
    const clock = fakeClock();
    const bus = createBus();
    const arbiter = createGazeArbiter(bus, { now: clock.now });

    for (let step = 0; step < 12; step++) bus.publish(face(step, 0.8, 0.3));
    arbiter.look('speaker', 2000);

    expect(arbiter.winner()).toBe('hold');
    expect(arbiter.read()?.x).toBeGreaterThan(0.5);
  });

  test('sends the model to where something last moved', () => {
    const clock = fakeClock();
    const bus = createBus();
    const arbiter = createGazeArbiter(bus, { now: clock.now });

    bus.publish({ type: 'vision.motion', ts: 0, x: 0.9, y: 0.9, magnitude: 0.9 });
    clock.advance(3000);
    arbiter.look('motion', 2000);

    expect(arbiter.read()).toEqual({ x: 0.8, y: 0.8 });
  });

  test('looks straight ahead when the target names nobody who is there', () => {
    const clock = fakeClock();
    const bus = createBus();
    const arbiter = createGazeArbiter(bus, { now: clock.now });

    arbiter.look('nearest_face', 2000);

    expect(arbiter.read()).toEqual({ x: 0, y: 0 });
  });

  test('sends the fixed targets somewhere fixed', () => {
    const clock = fakeClock();
    const arbiter = createGazeArbiter(createBus(), { now: clock.now });

    arbiter.look('up_thinking', 2000);
    const up = arbiter.read();
    arbiter.look('down', 2000);
    const down = arbiter.read();

    expect(up?.y).toBeLessThan(0);
    expect(down?.y).toBeGreaterThan(0);
  });

  test('gives the model priority over a tracked face', () => {
    const clock = fakeClock();
    const bus = createBus();
    const arbiter = createGazeArbiter(bus, { now: clock.now });

    bus.publish(face(0, 0.9, 0.9));
    arbiter.claim('hold', { x: -1, y: 0 }, 2000);

    expect(arbiter.winner()).toBe('hold');
    expect(arbiter.read()).toEqual({ x: -1, y: 0 });
  });

  test('gives a reflex glance priority over the model', () => {
    const clock = fakeClock();
    const bus = createBus();
    const arbiter = createGazeArbiter(bus, { now: clock.now });

    arbiter.claim('hold', { x: -1, y: 0 }, 5000);
    bus.publish({ type: 'vision.motion', ts: 0, x: 1, y: 1, magnitude: 0.9 });

    expect(arbiter.winner()).toBe('glance');
    expect(arbiter.read()).toEqual({ x: 1, y: 1 });
  });

  test('does not glance again straight away, so the eyes are not dragged around', () => {
    const clock = fakeClock();
    const bus = createBus();
    const arbiter = createGazeArbiter(bus, { now: clock.now });

    bus.publish({ type: 'vision.motion', ts: 0, x: 1, y: 1, magnitude: 0.9 });
    clock.advance(800);
    bus.publish({ type: 'vision.motion', ts: 1, x: 0, y: 0, magnitude: 0.9 });

    expect(arbiter.winner()).toBeNull();
  });

  test('glances again once it has had time to settle', () => {
    const clock = fakeClock();
    const bus = createBus();
    const arbiter = createGazeArbiter(bus, { now: clock.now });

    bus.publish({ type: 'vision.motion', ts: 0, x: 1, y: 1, magnitude: 0.9 });
    clock.advance(2300);
    bus.publish({ type: 'vision.motion', ts: 1, x: 0, y: 0, magnitude: 0.9 });

    expect(arbiter.winner()).toBe('glance');
  });

  test('ignores the movement of the face it is already watching', () => {
    const clock = fakeClock();
    const bus = createBus();
    const arbiter = createGazeArbiter(bus, { now: clock.now });

    for (let step = 0; step < 12; step++) bus.publish(face(step, 0.5, 0.5));
    bus.publish({ type: 'vision.motion', ts: 20, x: 0.55, y: 0.5, magnitude: 0.9 });

    expect(arbiter.winner()).toBe('track');
  });

  test('still glances at something well away from that face', () => {
    const clock = fakeClock();
    const bus = createBus();
    const arbiter = createGazeArbiter(bus, { now: clock.now });

    for (let step = 0; step < 12; step++) bus.publish(face(step, 0.5, 0.5));
    bus.publish({ type: 'vision.motion', ts: 20, x: 0.95, y: 0.1, magnitude: 0.9 });

    expect(arbiter.winner()).toBe('glance');
  });

  test('falls back to the model once the glance expires', () => {
    const clock = fakeClock();
    const bus = createBus();
    const arbiter = createGazeArbiter(bus, { now: clock.now });

    arbiter.claim('hold', { x: -0.5, y: 0 }, 5000);
    bus.publish({ type: 'vision.motion', ts: 0, x: 1, y: 1, magnitude: 0.9 });
    clock.advance(751);

    expect(arbiter.winner()).toBe('hold');
    expect(arbiter.read()).toEqual({ x: -0.5, y: 0 });
  });

  test('ignores motion too faint to be worth turning for', () => {
    const clock = fakeClock();
    const bus = createBus();
    const arbiter = createGazeArbiter(bus, { now: clock.now });

    bus.publish({ type: 'vision.motion', ts: 0, x: 1, y: 1, magnitude: 0.3 });

    expect(arbiter.read()).toBeNull();
  });

  test('stops reacting once stopped', () => {
    const clock = fakeClock();
    const bus = createBus();
    const arbiter = createGazeArbiter(bus, { now: clock.now });

    arbiter.stop();
    bus.publish(face(0, 0.5, 0.5));

    expect(arbiter.read()).toBeNull();
  });

  test('follows the first face it saw, not the second', () => {
    const clock = fakeClock();
    const bus = createBus();
    const arbiter = createGazeArbiter(bus, { now: clock.now });

    for (let step = 0; step < 12; step++) {
      bus.publish(face(step, 1, 0.5, 'a'));
      bus.publish(face(step, 0, 0.5, 'b'));
    }

    expect(arbiter.read()?.x).toBeCloseTo(1, 2);
  });

  test('switches to whoever starts talking', () => {
    const clock = fakeClock();
    const bus = createBus();
    const arbiter = createGazeArbiter(bus, { now: clock.now });

    for (let step = 0; step < 12; step++) {
      bus.publish(face(step, 1, 0.5, 'a'));
      bus.publish(face(step, 0, 0.5, 'b'));
    }
    bus.publish({ type: 'vision.expression', ts: 12, id: 'b', kind: 'talking' });
    for (let step = 13; step < 25; step++) {
      bus.publish(face(step, 1, 0.5, 'a'));
      bus.publish(face(step, 0, 0.5, 'b'));
    }

    expect(arbiter.read()?.x).toBeCloseTo(-1, 2);
  });

  test('moves on to the other face when the followed one goes', () => {
    const clock = fakeClock();
    const bus = createBus();
    const arbiter = createGazeArbiter(bus, { now: clock.now });

    for (let step = 0; step < 12; step++) {
      bus.publish(face(step, 1, 0.5, 'a'));
      bus.publish(face(step, 0, 0.5, 'b'));
    }
    bus.publish({ type: 'vision.face.lost', ts: 12, id: 'a' });
    for (let step = 13; step < 25; step++) bus.publish(face(step, 0, 0.5, 'b'));

    expect(arbiter.read()?.x).toBeCloseTo(-1, 2);
  });
});
