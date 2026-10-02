/**
 * What the face does without being asked: a double take at a wave, nodding off
 * by stages when nobody is there, and coming round when they return.
 *
 * No model is involved, which is the point. These keep working when the network
 * is down and they answer in a frame rather than in a second.
 *
 * The reflexes do not choose an emotion. The expression belongs to the
 * model, through `set_emotion`. Sleep is the one exception, because the session
 * closes while nobody is there and there is no model to ask.
 */
import type { SenseEventOf } from '@m8/shared';
import type { Bus, Unsubscribe } from '../bus/bus.ts';
import type { EyesControls } from './controller.ts';

/** One stage of being left alone. */
type AloneStage = SenseEventOf<'alone'>['stage'];

/** How long he looks around for somebody who has just gone. */
const LOOK_AROUND_MS = 7000;

/**
 * How sleepy each stage of being left alone makes him. Looking for somebody is
 * not sleepy at all, which is what keeps a face leaving the frame from reading
 * as a switch being thrown.
 */
const SLEEPINESS: Record<AloneStage, number> = {
  looking: 0,
  drowsy: 0.35,
  dozing: 0.6,
  asleep: 0.85,
};

/**
 * Act out one stage of being left alone.
 *
 * @param controls - The eyes.
 * @param stage - The stage just reached.
 */
function nodOff(controls: EyesControls, stage: AloneStage): void {
  if (stage === 'looking') {
    controls.lookAt('around', LOOK_AROUND_MS);
    return;
  }
  controls.setEmotion('sleepy', SLEEPINESS[stage]);
  if (stage === 'drowsy') controls.gesture('yawn');
  if (stage === 'dozing') controls.gesture('slow_blink');
}

/** A running set of reflexes. */
export interface Reflexes {
  /** Stop listening. */
  stop(): void;
}

/**
 * Wire the reflexes to a bus.
 *
 * @param bus - Where the tier 1 events arrive.
 * @param controls - The same three functions the model's tools call. A reflex
 * is not privileged; it just gets there first.
 * @returns A handle that unsubscribes.
 */
export function startReflexes(bus: Bus, controls: EyesControls): Reflexes {
  let sleepy = false;

  const listeners: Unsubscribe[] = [
    bus.on('vision.gesture', (event) => {
      if (event.kind === 'wave' && !sleepy) controls.gesture('double_take');
    }),
    bus.on('alone', (event) => {
      sleepy = event.stage !== 'looking';
      nodOff(controls, event.stage);
    }),
    bus.on('presence', (event) => {
      if (event.state !== 'present' || !sleepy) return;
      sleepy = false;
      // Waking hands the face back blank. What he feels about who walked in is
      // the model's to decide, once the session it reopens is live.
      controls.setEmotion('neutral', 0);
      controls.gesture('wide_eyes');
    }),
  ];

  return {
    stop() {
      for (const off of listeners) off();
    },
  };
}
