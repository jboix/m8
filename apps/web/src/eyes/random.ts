/**
 * A random source that can be replayed. The brainstem's blinks and wandering
 * are random by design, which would make "the recording drives the eyes
 * identically" impossible to check. Seeding it makes the claim testable and
 * costs eleven lines.
 */

/** 2^32, the period of the state and the divisor that maps it into 0 to 1. */
const RANGE = 4294967296;

/**
 * Build a deterministic random source.
 *
 * @remarks
 * Mulberry32. Not for anything that needs to be unguessable; this only has to
 * be repeatable and evenly spread.
 *
 * @param seed - Any integer. The same seed always gives the same sequence.
 * @returns A function shaped like `Math.random`.
 */
export function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = state;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / RANGE;
  };
}

/**
 * A seed to start a session with, when nothing is being replayed.
 *
 * @returns A fresh seed, safe to store in a recording.
 */
export function newSeed(): number {
  return Math.floor(Math.random() * RANGE);
}
