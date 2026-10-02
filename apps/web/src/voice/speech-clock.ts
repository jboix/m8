/**
 * How long the character has actually been speaking, and whether it is speaking
 * now.
 *
 * Both answers gate the microphone. The echo canceller can only subtract a
 * signal it has heard enough of, so what matters is cumulative speaker-active
 * time rather than how long the call has been open: a session that has been
 * silent for a minute has taught it nothing.
 */

/**
 * How long the character keeps counting as speaking after the queue empties.
 *
 * @remarks
 * Speech arrives in many small chunks and the queue runs dry between them.
 * Without this the gate flaps open mid-sentence and the microphone hears the
 * next word.
 */
const HANGOVER_MS = 300;

/** Tracks whether sound is going out, and how much has. */
export interface SpeechClock {
  /** Sound has started or continued. */
  started(): void;
  /** The queue has run dry. Speaking ends after the hangover. */
  drained(): void;
  /** Everything queued was dropped. Speaking ends at once. */
  stopped(): void;
  /** Whether sound is going out, hangover included. */
  speaking(): boolean;
  /** Cumulative speaker-active time, including any stretch in progress. */
  spokenMs(): number;
}

/** What the clock remembers between calls. */
interface ClockState {
  /** Whether sound is going out, hangover included. */
  speaking: boolean;
  /** Speaker-active time banked from finished stretches. */
  spoke: number;
  /** When the current stretch began, or undefined while silent. */
  since: number | undefined;
}

/**
 * Build a clock.
 *
 * @param now - The time source, injected for tests.
 * @param schedule - Delays the end of a stretch. Injected for tests.
 * @returns A clock that has never spoken.
 */
export function createSpeechClock(
  now: () => number = () => performance.now(),
  schedule: (run: () => void, delayMs: number) => () => void = timeout,
): SpeechClock {
  const state: ClockState = { speaking: false, spoke: 0, since: undefined };
  let cancelHangover: (() => void) | undefined;

  /**
   * Change whether sound is going out, banking the time across the change.
   * @param next - True while sound is going out.
   */
  function set(next: boolean): void {
    if (next === state.speaking) return;
    if (next) state.since = now();
    else if (state.since !== undefined) {
      state.spoke += now() - state.since;
      state.since = undefined;
    }
    state.speaking = next;
  }

  return {
    started() {
      cancelHangover?.();
      cancelHangover = undefined;
      set(true);
    },
    drained() {
      cancelHangover?.();
      cancelHangover = schedule(() => {
        set(false);
      }, HANGOVER_MS);
    },
    stopped() {
      cancelHangover?.();
      cancelHangover = undefined;
      set(false);
    },
    speaking: () => state.speaking,
    spokenMs: () => state.spoke + (state.since === undefined ? 0 : now() - state.since),
  };
}

/**
 * The default scheduler.
 *
 * @param run - What to run.
 * @param delayMs - How long to wait.
 * @returns A cancel.
 */
function timeout(run: () => void, delayMs: number): () => void {
  const timer = setTimeout(run, delayMs);
  return () => {
    clearTimeout(timer);
  };
}
