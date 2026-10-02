/** The bus delivers to the right listeners, in order, and survives handlers that change it mid-delivery. */

import { describe, expect, test } from 'bun:test';
import type { SenseEvent } from '@m8/shared';
import { createBus } from './bus.ts';

/**
 * A face event, which is the one the mouse and the camera both produce.
 *
 * @param ts - When it happened.
 * @returns The event.
 */
function face(ts: number): SenseEvent {
  return { type: 'vision.face', ts, id: 'test', x: 0.5, y: 0.5, size: 0.3, facing: true };
}

/**
 * A motion event.
 *
 * @param ts - When it happened.
 * @returns The event.
 */
function motion(ts: number): SenseEvent {
  return { type: 'vision.motion', ts, x: 0.2, y: 0.8, magnitude: 0.4 };
}

describe('the event bus', () => {
  test('delivers to everything-listeners in publish order', () => {
    const bus = createBus();
    const seen: number[] = [];
    bus.subscribe((event) => seen.push(event.ts));

    bus.publish(face(1));
    bus.publish(motion(2));

    expect(seen).toEqual([1, 2]);
  });

  test('delivers only the requested type, already narrowed', () => {
    const bus = createBus();
    const faces: string[] = [];
    bus.on('vision.face', (event) => faces.push(event.id));

    bus.publish(face(1));
    bus.publish(motion(2));

    expect(faces).toEqual(['test']);
  });

  test('stops delivering after unsubscribe', () => {
    const bus = createBus();
    let count = 0;
    const off = bus.on('vision.face', () => {
      count += 1;
    });

    bus.publish(face(1));
    off();
    bus.publish(face(2));
    off();

    expect(count).toBe(1);
  });

  test('keeps listeners of the same type independent', () => {
    const bus = createBus();
    let first = 0;
    let second = 0;
    const off = bus.on('vision.face', () => {
      first += 1;
    });
    bus.on('vision.face', () => {
      second += 1;
    });

    off();
    bus.publish(face(1));

    expect([first, second]).toEqual([0, 1]);
  });

  test('does not deliver an event to a listener that subscribed during it', () => {
    const bus = createBus();
    let late = 0;
    bus.subscribe(() => {
      bus.subscribe(() => {
        late += 1;
      });
    });

    bus.publish(face(1));

    expect(late).toBe(0);
  });

  test('lets a listener publish without recursing forever', () => {
    const bus = createBus();
    const seen: string[] = [];
    bus.on('vision.face', (event) => {
      seen.push(event.type);
      if (seen.length < 3) bus.publish(motion(event.ts));
    });
    bus.on('vision.motion', (event) => {
      seen.push(event.type);
      bus.publish(face(event.ts));
    });

    bus.publish(face(1));

    expect(seen.length).toBeGreaterThanOrEqual(3);
  });
});
