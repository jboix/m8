/** Runs ambient hearing for as long as it is wanted, and reports what it hears. */
import { useEffect, useState } from 'react';
import type { Bus } from '../../bus/bus.ts';
import { type HearingState, startHearing } from './start-hearing.ts';

/**
 * Listen to the room.
 *
 * @param bus - Where the derived events go.
 * @param speaking - Whether the character is talking right now. Its own voice
 * never reaches the classifier.
 * @param wanted - False keeps the second track closed, which is how the debug
 * panel takes its ears away without touching the conversation.
 * @returns What it is doing and how loud the room is, for the debug panel.
 */
export function useHearing(bus: Bus, speaking: () => boolean, wanted: boolean): HearingState {
  const [state, setState] = useState<HearingState>({ status: 'off' });

  useEffect(() => {
    if (!wanted) {
      setState({ status: 'off' });
      return;
    }
    const hearing = startHearing({ bus, speaking, onState: setState });
    return () => {
      hearing.stop();
    };
  }, [bus, speaking, wanted]);

  return state;
}
