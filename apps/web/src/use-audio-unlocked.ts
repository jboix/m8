/**
 * Whether the browser will let the page make and capture sound yet.
 *
 * Browsers keep an audio context suspended until somebody has touched the
 * page, and phones are strict about it. A reload lands on a page nobody has
 * touched, so the voice, the eyes' sounds and the microphone's worklet would
 * all be built suspended and stay silent. Nothing that needs audio is started
 * until this says so.
 */
import { useEffect, useState } from 'react';

/** How long a context is given to start by itself before the page counts as locked. */
const PROBE_MS = 400;

/** The gestures a browser accepts as somebody being there. */
const GESTURES = ['pointerdown', 'touchend', 'keydown'] as const;

/**
 * Play one silent sample, which is what older WebKit needs to see inside a
 * gesture before it lets a context run.
 *
 * @param context - The context to start.
 */
function playSilence(context: AudioContext): void {
  const source = context.createBufferSource();
  source.buffer = context.createBuffer(1, 1, context.sampleRate);
  source.connect(context.destination);
  source.start();
}

/**
 * Watch for the page being allowed to use audio.
 *
 * @returns True once a context can run: straight away where the browser
 * already trusts the page, otherwise after the first touch, click or key.
 */
export function useAudioUnlocked(): boolean {
  const [unlocked, setUnlocked] = useState(false);

  useEffect(() => {
    // Kept open on purpose. On WebKit the page stays unlocked for as long as a
    // context that was started by a gesture is alive.
    const probe = new AudioContext();
    const settle = () => {
      if (probe.state === 'running') setUnlocked(true);
    };
    const onGesture = () => {
      playSilence(probe);
      void probe.resume().then(settle);
    };

    void probe.resume().then(settle, () => {});
    const timer = setTimeout(settle, PROBE_MS);
    for (const gesture of GESTURES) addEventListener(gesture, onGesture, { passive: true });
    return () => {
      clearTimeout(timer);
      for (const gesture of GESTURES) removeEventListener(gesture, onGesture);
      void probe.close();
    };
  }, []);

  return unlocked;
}
