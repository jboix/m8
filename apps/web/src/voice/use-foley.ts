/**
 * Runs the eyes' sounds: reads the rig's pose every frame from outside `eyes/`,
 * works out the cues, and plays them into whichever voice is running.
 */
import { useCallback, useEffect, useRef } from 'react';
import { createSeededRandom, type EyesInspector } from '../eyes/index.ts';
import { createFoley, type Foley, type FoleyOutput, type FoleySound } from './foley.ts';
import { createFoleyCues, type FoleySettings } from './foley-cues.ts';

/** What the hook needs to know about the voice. */
export interface FoleySource {
  /**
   * Where to play.
   * @returns The voice's output, or null while there is no voice.
   */
  foley(): FoleyOutput | null;
  /**
   * Whether he is talking, which ducks the sounds.
   * @returns True while his voice is playing.
   */
  speaking(): boolean;
}

/** A synth, and the output it was built on. */
interface Running {
  /** The synth. */
  foley: Foley;
  /** What it plays into. A new session brings a new one. */
  output: FoleyOutput;
}

/**
 * Keep a synth on the current output.
 *
 * @param running - The synth so far, or null.
 * @param output - Where to play now, or null.
 * @param seed - The rig's seed, so a replay sounds the same.
 * @returns The synth to use, rebuilt when the output changed, null without one.
 */
function follow(running: Running | null, output: FoleyOutput | null, seed: number): Running | null {
  if (running?.output === output) return running;
  running?.foley.stop();
  return output ? { foley: createFoley(output, createSeededRandom(seed)), output } : null;
}

/**
 * Make the eyes' sounds.
 *
 * @param inspector - The rig, read only. Null before the eyes have mounted.
 * @param source - The voice to play into.
 * @param settings - Which sounds are on.
 * @returns A way to fire one sound by itself, for the debug panel.
 */
export function useFoley(
  inspector: EyesInspector | null,
  source: FoleySource,
  settings: FoleySettings,
): (sound: FoleySound) => void {
  const running = useRef<Running | null>(null);
  const latest = useRef(settings);
  latest.current = settings;

  useEffect(() => {
    if (!inspector) return;
    const cues = createFoleyCues();
    let last = performance.now();
    let frame = requestAnimationFrame(function tick(now) {
      const deltaSeconds = (now - last) / 1000;
      last = now;
      const { emotion } = inspector.expression();
      const step = cues.step(
        { pose: inspector.pose(), emotion, gesture: inspector.playingGesture() },
        deltaSeconds,
      );
      running.current = follow(running.current, source.foley(), inspector.seed());
      running.current?.foley.apply(step, latest.current, source.speaking());
      frame = requestAnimationFrame(tick);
    });
    return () => {
      cancelAnimationFrame(frame);
      running.current?.foley.stop();
      running.current = null;
    };
  }, [inspector, source]);

  return useCallback((sound) => running.current?.foley.play(sound), []);
}
