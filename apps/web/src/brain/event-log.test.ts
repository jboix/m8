/** The batches the server is sent. */
import { describe, expect, test } from 'bun:test';
import type { SenseEvent } from '@m8/shared';
import { createBus } from '../bus/bus.ts';
import { startEventLog } from './event-log.ts';

describe('startEventLog', () => {
  test('keeps the slow kinds, drops the fast ones, and flushes when stopped', () => {
    const bus = createBus();
    const batches: SenseEvent[][] = [];
    const stop = startEventLog(bus, (events) => batches.push(events));

    bus.publish({ type: 'vision.gesture', ts: 1, kind: 'wave' });
    bus.publish({ type: 'vision.motion', ts: 2, x: 0.5, y: 0.5, magnitude: 0.4 });
    bus.publish({ type: 'presence', ts: 3, state: 'absent' });
    stop();
    bus.publish({ type: 'presence', ts: 4, state: 'present' });

    expect(batches.map((batch) => batch.map((event) => event.type))).toEqual([
      ['vision.gesture', 'presence'],
    ]);
  });

  test('sends nothing when nothing happened', () => {
    const batches: SenseEvent[][] = [];
    startEventLog(createBus(), (events) => batches.push(events))();

    expect(batches).toEqual([]);
  });
});
