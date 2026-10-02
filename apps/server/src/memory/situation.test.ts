/** The note to himself, and when it is allowed into the session. */
import { describe, expect, test } from 'bun:test';
import type { Turn } from './sessions.ts';
import { keepSituation } from './situation.ts';

/** One minute. */
const MINUTE = 60_000;

/**
 * A conversation of a given length.
 *
 * @param count - How many turns.
 * @returns The turns, alternating sides.
 */
function turns(count: number): Turn[] {
  return Array.from({ length: count }, (_, index) => ({
    role: index % 2 === 0 ? ('user' as const) : ('model' as const),
    text: `line ${index}`,
    ts: index,
  }));
}

/**
 * A situation keeper wired to fakes.
 *
 * @param said - How many turns the session has.
 * @returns The keeper, what it sent, and how many times it asked the model.
 */
function wired(said: number) {
  const sent: string[] = [];
  const asked: string[] = [];
  const situation = keepSituation(
    {
      complete: (request) => {
        asked.push(request.prompt);
        return Promise.resolve('You are losing a staring contest, two nil.');
      },
      sessionId: 1,
      turns: () => turns(said),
      send: (text) => sent.push(text),
      person: 'Ada',
    },
    0,
  );
  return { situation, sent, asked };
}

describe('keepSituation', () => {
  test('writes nothing before the interval has passed', () => {
    const { situation, asked } = wired(40);
    situation.tick(4 * MINUTE);

    expect(asked).toEqual([]);
  });

  test('writes a note, and holds it until nobody has spoken for a moment', async () => {
    const { situation, sent } = wired(40);
    situation.tick(5 * MINUTE);
    await Bun.sleep(0);

    situation.heard(5 * MINUTE + 1000);
    situation.tick(5 * MINUTE + 2000);
    expect(sent).toEqual([]);

    situation.tick(5 * MINUTE + 6000);
    expect(sent).toEqual(['[so far] You are losing a staring contest, two nil.']);
  });

  test('does not bother the model about a conversation that has barely moved', () => {
    const { situation, asked } = wired(6);
    situation.tick(5 * MINUTE);

    expect(asked).toEqual([]);
  });
});
