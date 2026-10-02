/** Holds the setup for the life of the tab, and the moment between the card and the character. */
import type { Setup } from '@m8/shared';
import { useCallback, useEffect, useState } from 'react';
import { clearSetup, loadSetup, saveSetup } from './store.ts';

/**
 * How long the card takes to fade and the eyes take to reach the centre. The
 * stylesheet's `--setup-leave` is the same number.
 */
const LEAVE_MS = 900;

/**
 * Where setup is up to.
 *
 * - `asking`: the card is up and nothing is stored.
 * - `leaving`: the card is fading and the eyes are moving to the centre.
 * - `done`: the character has the screen.
 */
type SetupPhase = 'asking' | 'leaving' | 'done';

/** What the app gets back. */
interface SetupState {
  /** Where setup is up to. */
  phase: SetupPhase;
  /** What was chosen, or null while asking. */
  setup: Setup | null;
  /** True once, for the session that follows the setup screen: he introduces himself. */
  fresh: boolean;
  /** Finish setup with what was chosen. */
  finish(setup: Setup): void;
  /** Forget everything and ask again. */
  reset(): void;
}

/**
 * Run the setup flow.
 *
 * @returns The phase, the setup and the two ways of changing them.
 */
export function useSetup(): SetupState {
  const [setup, setSetup] = useState(() => loadSetup(localStorage));
  const [phase, setPhase] = useState<SetupPhase>(setup ? 'done' : 'asking');
  const [fresh, setFresh] = useState(false);

  useEffect(() => {
    if (phase !== 'leaving') return;
    const timer = setTimeout(() => {
      setPhase('done');
    }, LEAVE_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [phase]);

  const finish = useCallback((chosen: Setup) => {
    saveSetup(localStorage, chosen);
    setSetup(chosen);
    setFresh(true);
    setPhase('leaving');
  }, []);

  const reset = useCallback(() => {
    clearSetup(localStorage);
    setSetup(null);
    setFresh(false);
    setPhase('asking');
  }, []);

  return { phase, setup, fresh, finish, reset };
}
