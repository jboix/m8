/**
 * The one component the app mounts. It renders the SVG once, starts the loop,
 * and hands back the three functions the tools will call. After the first
 * paint React is not involved in the animation at all.
 */
import { useEffect, useRef } from 'react';
import type { Bus } from '../bus/bus.ts';
import { createEyesController, type EyesController } from './controller.ts';
import { EyesView, type PartialRigHandles } from './eyes-view.tsx';
import { completeFlourishHandles, emptyFlourishHandles } from './flourish-view.tsx';
import { createGazeArbiter } from './gaze-arbiter.ts';
import { startReflexes } from './reflexes.ts';
import type { EyeHandles, RigHandles } from './rig-writer.ts';
import { createVoiceMotion } from './voice-motion.ts';

/** What the stage needs from its host. */
export interface EyesProps {
  /** The bus the reflexes read. The eyes publish nothing. */
  bus: Bus;
  /** Seeds the brainstem. Leave unset outside a replay. */
  seed?: number;
  /**
   * Called once the rig is live.
   * @param controller - The running rig. It stops when the component unmounts.
   */
  onReady?: (controller: EyesController) => void;
}

/** The elements every eye must have reported before the loop can start. */
const REQUIRED: (keyof EyeHandles)[] = ['group', 'shape', 'glow', 'highlight'];

/**
 * Check that both eyes reported all of their parts.
 *
 * @param handles - What the view has filled in so far.
 * @returns The complete handles, or `null` if anything is missing.
 */
function completeHandles(handles: PartialRigHandles): RigHandles | null {
  const { left, right } = handles;
  if (!left || !right) return null;
  const ready = REQUIRED.every((part) => left[part] !== undefined && right[part] !== undefined);
  return ready ? ({ left, right } as RigHandles) : null;
}

/**
 * The character.
 *
 * @param props - An optional callback receiving the running rig.
 * @returns The stage, filling its container.
 */
export function Eyes({ bus, seed, onReady }: EyesProps) {
  const handles = useRef<PartialRigHandles>({});
  const flourishHandles = useRef(emptyFlourishHandles());

  useEffect(() => {
    const complete = completeHandles(handles.current);
    if (!complete) return;

    const controller = createEyesController({
      handles: complete,
      arbiter: createGazeArbiter(bus),
      voiceMotion: createVoiceMotion(bus),
      flourishes: completeFlourishHandles(flourishHandles.current),
      ...(seed === undefined ? {} : { seed }),
    });
    const reflexes = startReflexes(bus, controller.controls);
    onReady?.(controller);
    return () => {
      reflexes.stop();
      controller.stop();
    };
  }, [bus, seed, onReady]);

  return <EyesView handles={handles.current} flourishes={flourishHandles.current} />;
}
