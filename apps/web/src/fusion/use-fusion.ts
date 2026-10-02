/** Runs fusion for as long as there is a session for it to speak into. */
import { useEffect, useState } from 'react';
import type { FloorHolder } from '../brain/floor.ts';
import type { Bus } from '../bus/bus.ts';
import { createMood } from '../mood/mood.ts';
import { type FusionState, startFusion } from './fusion.ts';

/** Nothing noticed yet. */
const QUIET: FusionState = {
  voltage: 0,
  threshold: 1,
  mood: createMood().mood(),
  fires: [],
  quiet: 0,
};

/**
 * Wire the senses to the session.
 *
 * @param bus - Where the events arrive.
 * @param say - Puts a line into the live session.
 * @param floor - Who has the floor. Nothing is sent unless it is free.
 * @param wanted - False stops it noticing anything, which is how the debug
 * panel takes the character's autonomy away to see what is underneath.
 * @returns What it is noticing, for the debug panel.
 */
export function useFusion(
  bus: Bus,
  say: (text: string, answer: boolean) => void,
  floor: () => FloorHolder,
  wanted: boolean,
): FusionState {
  const [state, setState] = useState<FusionState>(QUIET);

  useEffect(() => {
    if (!wanted) {
      setState(QUIET);
      return;
    }
    const fusion = startFusion({ bus, say, floor, onState: setState });
    return () => {
      fusion.stop();
    };
  }, [bus, say, floor, wanted]);

  return state;
}
