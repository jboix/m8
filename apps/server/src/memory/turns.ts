/**
 * Joins the fragments a transcript arrives in into whole turns.
 *
 * The provider streams a sentence a few words at a time, and what is worth
 * storing is what each side said, once, in full.
 */
import type { Turn, TurnRole } from './sessions.ts';

/** Collects fragments until the other side speaks. */
export interface TurnCollector {
  /**
   * Add a fragment.
   * @param role - Who is speaking.
   * @param text - The next few words, spacing included.
   * @param now - When it arrived.
   */
  add(role: TurnRole, text: string, now: number): void;
  /** Hand over whatever is still open. Call it when the session ends. */
  flush(): void;
}

/**
 * Build a collector.
 *
 * @param onTurn - Called once per finished turn, in order. Never called with
 * an empty one.
 * @returns The collector.
 */
export function createTurnCollector(onTurn: (turn: Turn) => void): TurnCollector {
  let open: Turn | null = null;

  /** Close the turn in progress, if there is one. */
  function flush(): void {
    const text = open?.text.trim() ?? '';
    if (open && text !== '') onTurn({ ...open, text });
    open = null;
  }

  return {
    add(role, text, now) {
      if (open && open.role !== role) flush();
      open = { role, text: (open?.text ?? '') + text, ts: now };
    },
    flush,
  };
}
