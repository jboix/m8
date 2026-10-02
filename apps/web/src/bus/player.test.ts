/** A recording replays in order, on its own gaps, and stops when told to. */

import { describe, expect, test } from 'bun:test';
import type { Recording, SenseEvent } from '@m8/shared';
import { createBus } from './bus.ts';
import { playRecording } from './player.ts';
import { startRecording } from './recorder.ts';

/**
 * A face event.
 *
 * @param ts - When it happened.
 * @param x - Where the face is.
 * @returns The event.
 */
function face(ts: number, x = 0.5): SenseEvent {
  return { type: 'vision.face', ts, id: 'test', x, y: 0.5, size: 0.3, facing: true };
}

/**
 * A recording of three faces, one second apart.
 *
 * @returns The recording.
 */
function threeFaces(): Recording {
  return {
    version: 1,
    label: 'test',
    recordedAt: 0,
    seed: 7,
    events: [face(1000, 0.1), face(2000, 0.5), face(4000, 0.9)],
  };
}

/** A scheduler with no clock: it hands back the pending run for a test to fire. */
function manualScheduler() {
  const queue: { run: () => void; delayMs: number }[] = [];
  return {
    schedule(run: () => void, delayMs: number) {
      queue.push({ run, delayMs });
      return () => {
        const at = queue.findIndex((entry) => entry.run === run);
        if (at >= 0) queue.splice(at, 1);
      };
    },
    /** Fire the next scheduled step. @returns Its delay. */
    tick(): number {
      const next = queue.shift();
      if (!next) throw new Error('nothing scheduled');
      next.run();
      return next.delayMs;
    },
    pending: () => queue.length,
  };
}

describe('playRecording', () => {
  test('replays every event in order, on the gaps it was recorded with', () => {
    const bus = createBus();
    const clock = manualScheduler();
    const seen: SenseEvent[] = [];
    const delays: number[] = [];
    bus.subscribe((event) => seen.push(event));

    playRecording(bus, threeFaces(), { schedule: clock.schedule });
    delays.push(clock.tick(), clock.tick(), clock.tick());

    expect(seen.map((event) => event.ts)).toEqual([1000, 2000, 4000]);
    expect(delays).toEqual([0, 1000, 2000]);
  });

  test('honours the playback rate', () => {
    const bus = createBus();
    const clock = manualScheduler();

    playRecording(bus, threeFaces(), { schedule: clock.schedule, rate: 4 });
    clock.tick();

    expect(clock.tick()).toBe(250);
  });

  test('reports finishing exactly once', () => {
    const bus = createBus();
    const clock = manualScheduler();
    let finished = 0;

    playRecording(bus, threeFaces(), {
      schedule: clock.schedule,
      onFinished: () => {
        finished += 1;
      },
    });
    clock.tick();
    clock.tick();
    clock.tick();

    expect(finished).toBe(1);
    expect(clock.pending()).toBe(0);
  });

  test('finishes an empty recording without scheduling anything', () => {
    const bus = createBus();
    const clock = manualScheduler();
    let finished = 0;

    const player = playRecording(
      bus,
      { version: 1, label: '', recordedAt: 0, seed: 1, events: [] },
      {
        schedule: clock.schedule,
        onFinished: () => {
          finished += 1;
        },
      },
    );

    expect(finished).toBe(1);
    expect(clock.pending()).toBe(0);
    expect(player.progress()).toBe(1);
  });

  test('publishes nothing more after stop', () => {
    const bus = createBus();
    const clock = manualScheduler();
    const seen: SenseEvent[] = [];
    bus.subscribe((event) => seen.push(event));

    const player = playRecording(bus, threeFaces(), { schedule: clock.schedule });
    clock.tick();
    player.stop();

    expect(clock.pending()).toBe(0);
    expect(seen).toHaveLength(1);
  });
});

describe('startRecording', () => {
  test('captures what crosses the bus and round-trips through a replay', () => {
    const bus = createBus();
    const recorder = startRecording(bus, 42, () => 1_700_000);
    for (const event of threeFaces().events) bus.publish(event);
    const recording = recorder.stop('a session');

    expect(recording).toMatchObject({ version: 1, label: 'a session', seed: 42 });
    expect(recorder.size()).toBe(3);

    const replayed: SenseEvent[] = [];
    const clock = manualScheduler();
    const second = createBus();
    second.subscribe((event) => replayed.push(event));
    playRecording(second, recording, { schedule: clock.schedule });
    clock.tick();
    clock.tick();
    clock.tick();

    expect(replayed).toEqual(recording.events);
  });

  test('stops capturing once stopped', () => {
    const bus = createBus();
    const recorder = startRecording(bus, 1);
    bus.publish(face(1));
    recorder.stop('');
    bus.publish(face(2));

    expect(recorder.size()).toBe(1);
  });
});
