/**
 * The leaky integrate-and-fire filter that decides whether something is worth
 * reacting to. Section 6 of docs/architecture.md.
 *
 * Every event adds charge. Charge leaks away. When it crosses a threshold the
 * filter fires and resets. Repeated events of the same kind add less and less,
 * and recover when they stop, which is what stops the fifth identical wave
 * getting the same reaction as the first.
 *
 * Pure arithmetic with no dependencies, so it runs in a browser, on a server,
 * or in a test with nothing around it.
 */

/** How the filter behaves. */
export interface SalienceConfig {
  /**
   * Seconds for the charge to leak to about a third. Short forgets quickly and
   * needs a burst to fire; long lets unrelated things add up.
   */
  leakSeconds: number;
  /** What one repeat leaves of a stimulus's strength. Below 1. */
  habituation: number;
  /** Seconds for a habituated stimulus to become interesting again. */
  recoverySeconds: number;
  /** Seconds after firing during which nothing fires again. */
  refractorySeconds: number;
}

/** A sensible starting point, tuned by hand and meant to be argued with. */
export const DEFAULT_SALIENCE: SalienceConfig = {
  leakSeconds: 2.5,
  habituation: 0.75,
  recoverySeconds: 25,
  refractorySeconds: 1.5,
};

/** What crossing the threshold looked like. */
export interface SalienceFire {
  /** The charge at the moment it fired. */
  voltage: number;
  /** The kinds of thing that put it there, strongest first. */
  causes: string[];
}

/** A running filter. */
export interface Salience {
  /**
   * Add charge.
   * @param key - What kind of thing this is. Habituation is per key, so
   * `sound.class:dog` habituates separately from `sound.class:door`.
   * @param weight - How much it is worth before habituation.
   */
  stimulate(key: string, weight: number): void;
  /**
   * Let time pass.
   * @param deltaSeconds - How much.
   * @param threshold - What it takes to fire right now. Supplied by mood, so a
   * bored character reacts to more than an engaged one.
   * @returns What fired, or `null`.
   */
  step(deltaSeconds: number, threshold: number): SalienceFire | null;
  /** The charge now, for the debug panel's graph. */
  voltage(): number;
  /**
   * How interesting a kind of thing still is.
   * @param key - Which kind.
   * @returns 1 for something never seen, approaching 0 for something constant.
   */
  interest(key: string): number;
}

/** What one kind of stimulus has earned for itself. */
interface Habit {
  /** How much of its weight survives, 0 to 1. */
  gain: number;
  /** How much charge it has contributed since the last fire. */
  contributed: number;
}

/**
 * Decay towards a target over time.
 *
 * @param value - Where it is.
 * @param target - Where it is heading.
 * @param seconds - Time constant: how long to cover about two thirds.
 * @param deltaSeconds - How much time passed.
 * @returns The new value.
 */
function decay(value: number, target: number, seconds: number, deltaSeconds: number): number {
  const rate = Math.min(1, deltaSeconds / seconds);
  return value + (target - value) * rate;
}

/**
 * What put the charge there, strongest first.
 *
 * @param habits - Every kind of stimulus seen so far.
 * @returns The keys that contributed since the last fire.
 */
function blame(habits: Map<string, Habit>): string[] {
  return [...habits.entries()]
    .filter(([, habit]) => habit.contributed > 0)
    .sort((left, right) => right[1].contributed - left[1].contributed)
    .map(([key]) => key);
}

/**
 * Build a filter.
 *
 * @param config - How it behaves. Defaults to {@link DEFAULT_SALIENCE}.
 * @returns A filter holding no charge and interested in everything.
 */
export function createSalience(config: SalienceConfig = DEFAULT_SALIENCE): Salience {
  const habits = new Map<string, Habit>();
  let charge = 0;
  let quietFor = config.refractorySeconds;

  return {
    stimulate(key, weight) {
      const habit = habits.get(key) ?? { gain: 1, contributed: 0 };
      charge += weight * habit.gain;
      habit.contributed += weight * habit.gain;
      // Habituating on arrival rather than on firing is what makes the second
      // of a pair weaker than the first, not just the second burst.
      habit.gain *= config.habituation;
      habits.set(key, habit);
    },

    step(deltaSeconds, threshold) {
      charge = decay(charge, 0, config.leakSeconds, deltaSeconds);
      quietFor += deltaSeconds;
      for (const habit of habits.values()) {
        habit.gain = decay(habit.gain, 1, config.recoverySeconds, deltaSeconds);
      }
      if (charge < threshold || quietFor < config.refractorySeconds) return null;

      const fire = { voltage: charge, causes: blame(habits) };
      charge = 0;
      quietFor = 0;
      for (const habit of habits.values()) habit.contributed = 0;
      return fire;
    },

    voltage: () => charge,
    interest: (key) => habits.get(key)?.gain ?? 1,
  };
}
