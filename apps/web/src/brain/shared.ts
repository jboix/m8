/**
 * What every session in the life of the brain hook shares, and the switches
 * that act on the running session rather than by reopening it: the mute and
 * the talk button.
 */
import type { Listening } from '@m8/shared';
import { type RefObject, useEffect, useMemo, useRef } from 'react';
import type { Bus } from '../bus/bus.ts';
import type { Voice } from '../voice/player.ts';
import type { BrainClient } from './client.ts';
import type { LocalTools } from './dispatch.ts';
import { createFloor, type Floor } from './floor.ts';

/**
 * Hold a value where a callback can read the current one.
 *
 * @param value - What to hold.
 * @returns A ref that always has the latest, so flipping a switch takes effect
 * on the next frame of audio rather than by reopening the session.
 */
function useLatest<Held>(value: Held): RefObject<Held> {
  const held = useRef(value);
  held.current = value;
  return held;
}

/** What every session in the life of the hook shares. */
export interface Shared {
  /** Filled in with the client, so the panel can put words in. */
  live: RefObject<BrainClient | null>;
  /** Filled in with the voice, so its effect can be set and changed. */
  player: RefObject<Voice | null>;
  /** Whether to hold the microphone for every utterance. */
  halfDuplex: RefObject<boolean>;
  /** Who has the floor. It outlives a session, because fusion reads it. */
  floor: Floor;
  /** Where the voice levels go. */
  bus: Bus;
  /** Whether the person has muted the microphone. A session that opens reads it. */
  muted: RefObject<boolean>;
  /** Whether the person holds the talk button. The microphone gate reads it per frame. */
  talking: RefObject<boolean>;
  /** Filled in by the running session: opens or releases its microphone. */
  setMic: RefObject<((muted: boolean) => void) | null>;
  /** The tools that answer from what the browser knows, read at call time. */
  local: RefObject<LocalTools>;
}

/**
 * Build what the sessions share, once.
 *
 * @param halfDuplex - The current half duplex setting.
 * @param bus - Where the voice levels go.
 * @param localTools - The tools that answer from what the browser knows.
 * @returns The same object for the life of the hook, so it is safe in a
 * dependency list.
 */
export function useShared(halfDuplex: boolean, bus: Bus, localTools: LocalTools): Shared {
  const live = useRef<BrainClient | null>(null);
  const player = useRef<Voice | null>(null);
  const duplex = useLatest(halfDuplex);
  const muted = useRef(false);
  const talking = useRef(false);
  const setMic = useRef<((muted: boolean) => void) | null>(null);
  const local = useLatest(localTools);
  return useMemo(
    () => ({
      ...{ live, player, halfDuplex: duplex, floor: createFloor(), bus },
      ...{ muted, talking, setMic, local },
    }),
    [duplex, bus, local],
  );
}

/**
 * Mute and unmute the running session.
 *
 * @remarks
 * Muting releases the microphone, so the browser's indicator goes off, and
 * leaves the session open: he still sees, and he can still speak. That is
 * different from not wanting the session at all, which closes it.
 *
 * @param shared - Where the running session left its microphone switch.
 * @param muted - Whether the person has muted.
 */
export function useMute(shared: Shared, muted: boolean): void {
  useEffect(() => {
    shared.muted.current = muted;
    shared.setMic.current?.(muted);
  }, [shared, muted]);
}

/**
 * Turn the talk button into the person's turn.
 *
 * @remarks
 * The mark goes up before the microphone opens and after it closes, so the
 * model never gets speech outside a turn. Both edges count as hearing them:
 * on the press the floor is theirs, and on the release an answer is owed.
 *
 * @param shared - The client, the floor and the button's ref.
 * @param listening - Who marks the turns. Anything but the button is ignored.
 * @param talking - Whether the button is held.
 */
export function useTalkButton(shared: Shared, listening: Listening, talking: boolean): void {
  useEffect(() => {
    if (listening !== 'button' || shared.talking.current === talking) return;
    if (talking) {
      shared.live.current?.activity('start');
      shared.talking.current = true;
    } else {
      shared.talking.current = false;
      shared.live.current?.activity('end');
    }
    shared.floor.heard();
  }, [shared, listening, talking]);
}
