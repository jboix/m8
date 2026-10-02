/**
 * The sounds the eyes make. Small robot sounds, synthesised
 * from oscillators and noise, with no audio files and no library.
 *
 * They play into the voice's own output, so they leave through the same sink
 * and the echo canceller has them as a reference. They are much quieter than
 * his voice and duck further under it.
 */
import { type Emotion, GestureKind } from '@m8/shared';
import { type FoleyCues, type FoleySettings, maskCues } from './foley-cues.ts';
import { GESTURE_SOUNDS, MOTIFS, SQUEAK, type Tone } from './foley-motifs.ts';

/** Where the sounds go. The voice provides it. */
export interface FoleyOutput {
  /** The playback context. */
  context: AudioContext;
  /** The node to play into. It reaches the speaker the same way his voice does. */
  input: AudioNode;
}

/** A sound the debug panel can fire by itself. */
export type FoleySound = Emotion | GestureKind | 'blink' | 'squeak' | 'servo';

/**
 * Master loudness. His voice peaks near 1. At this level the loudest motif peaks
 * near 0.15, which is quiet beside him and still audible on a phone speaker.
 */
const MASTER = 0.18;

/** Master loudness while he talks. */
const DUCKED = 0.035;

/** How far a motif's pitch may wander, as a fraction. Keeps repeats from sounding stamped. */
const DETUNE = 0.04;

/** How long the blink's noise burst lasts, in seconds. */
const BLINK_SECONDS = 0.03;

/** The running synth. */
export interface Foley {
  /**
   * Play what one frame asks for.
   * @param cues - From the cue tracker.
   * @param settings - Which sounds are on.
   * @param ducked - True while he is talking.
   */
  apply(cues: FoleyCues, settings: FoleySettings, ducked: boolean): void;
  /**
   * Play one sound by itself, whatever the settings say. For the debug panel.
   * @param sound - Which one.
   */
  play(sound: FoleySound): void;
  /** Stop the servo and disconnect. */
  stop(): void;
}

/**
 * Play one gliding tone.
 *
 * @param output - Where it goes.
 * @param tone - The tone.
 * @param scale - Multiplies its pitch and loudness: `{ pitch: 1, gain: 1 }` plays it as written.
 */
function playTone(
  { context, input }: FoleyOutput,
  tone: Tone,
  scale: { pitch: number; gain: number },
): void {
  const start = context.currentTime + tone.at / 1000;
  const end = start + tone.ms / 1000;
  const oscillator = context.createOscillator();
  oscillator.type = tone.wave;
  oscillator.frequency.setValueAtTime(tone.from * scale.pitch, start);
  oscillator.frequency.exponentialRampToValueAtTime(tone.to * scale.pitch, end);
  const envelope = context.createGain();
  // A few milliseconds up and a ramp down, or every tone starts and ends on a click.
  envelope.gain.setValueAtTime(0, start);
  envelope.gain.linearRampToValueAtTime(tone.gain * scale.gain, start + 0.008);
  envelope.gain.linearRampToValueAtTime(0, end);
  oscillator.connect(envelope).connect(input);
  oscillator.start(start);
  oscillator.stop(end + 0.01);
}

/**
 * Make the blink's noise, once.
 *
 * @param context - The playback context.
 * @param random - The seeded source, so the burst is the same on a replay.
 * @returns A short buffer of noise that fades out.
 */
function blinkNoise(context: AudioContext, random: () => number): AudioBuffer {
  const length = Math.ceil(context.sampleRate * BLINK_SECONDS);
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const samples = buffer.getChannelData(0);
  for (let index = 0; index < length; index += 1) {
    samples[index] = (random() * 2 - 1) * (1 - index / length);
  }
  return buffer;
}

/**
 * Play the blink: a tick of filtered noise.
 *
 * @param output - Where it goes.
 * @param noise - The burst from {@link blinkNoise}.
 */
function playBlink({ context, input }: FoleyOutput, noise: AudioBuffer): void {
  const source = context.createBufferSource();
  source.buffer = noise;
  const filter = context.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 2600;
  const level = context.createGain();
  level.gain.value = 0.5;
  source.connect(filter).connect(level).connect(input);
  source.start();
}

/** The servo: one oscillator that runs for the life of the synth, usually silent. */
interface Servo {
  /**
   * Set how hard it is working.
   * @param work - 0 silent to 1 a full saccade.
   */
  set(work: number): void;
  /** Stop it for good. */
  stop(): void;
}

/**
 * Start the servo whir.
 *
 * @param output - Where it goes.
 * @returns The servo, silent until the gaze moves.
 */
function startServo({ context, input }: FoleyOutput): Servo {
  const oscillator = context.createOscillator();
  oscillator.type = 'sawtooth';
  oscillator.frequency.value = 90;
  const filter = context.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 900;
  const level = context.createGain();
  level.gain.value = 0;
  oscillator.connect(filter).connect(level).connect(input);
  oscillator.start();

  return {
    set(work) {
      // Pitch follows speed, which is what makes it sound like a motor and not a hum.
      level.gain.setTargetAtTime(work * 0.45, context.currentTime, 0.03);
      oscillator.frequency.setTargetAtTime(90 + work * 170, context.currentTime, 0.04);
    },
    stop() {
      oscillator.stop();
      level.disconnect();
    },
  };
}

/** The sounds that are one shot each, by name. */
type OneShot = 'blink' | 'squeak';

/**
 * Build the one-shot players.
 *
 * @param bus - Where they play.
 * @param noise - The blink's burst.
 * @returns One function per sound, taking its loudness from 0 to 1.
 */
function oneShots(bus: FoleyOutput, noise: AudioBuffer): Record<OneShot, (gain: number) => void> {
  return {
    blink: () => {
      playBlink(bus, noise);
    },
    squeak: (gain) => {
      playTone(bus, SQUEAK, { pitch: 1, gain });
    },
  };
}

/**
 * Run the servo for a moment, so it can be heard without moving the eyes.
 *
 * @param servo - The servo.
 */
function demoServo(servo: Servo): void {
  servo.set(0.8);
  setTimeout(() => {
    servo.set(0);
  }, 350);
}

/** Everything a running synth owns. */
interface Parts {
  /** The playback context, for its clock. */
  context: AudioContext;
  /** The gain every sound passes through. */
  master: GainNode;
  /** How loud the person wants the sounds, 0 to 1. Set on every frame from the settings. */
  volume: number;
  /** The whir. */
  servo: Servo;
  /** The one-shot players. */
  shots: Record<OneShot, (gain: number) => void>;
  /**
   * Play a motif, slightly detuned.
   * @param tones - An emotion's motif or a gesture's sound.
   */
  motif(tones: Tone[]): void;
}

/**
 * Find the tones behind a named sound.
 *
 * @param sound - An emotion or a gesture.
 * @returns Its tones.
 */
function tonesOf(sound: Emotion | GestureKind): Tone[] {
  const gesture = GestureKind.safeParse(sound);
  return gesture.success ? GESTURE_SOUNDS[gesture.data] : MOTIFS[sound as Emotion];
}

/**
 * Play what one frame asks for.
 *
 * @param parts - The synth.
 * @param heard - The cues that are switched on.
 * @param ducked - True while he is talking.
 */
function applyCues(parts: Parts, heard: FoleyCues, ducked: boolean): void {
  const level = (ducked ? DUCKED : MASTER) * parts.volume;
  parts.master.gain.setTargetAtTime(level, parts.context.currentTime, 0.05);
  parts.servo.set(heard.servo);
  if (heard.blink) parts.shots.blink(1);
  if (heard.squeak > 0) parts.shots.squeak(heard.squeak);
  if (heard.gesture) parts.motif(GESTURE_SOUNDS[heard.gesture]);
  if (heard.motif) parts.motif(MOTIFS[heard.motif]);
}

/**
 * Play one sound by itself, at full foley loudness.
 *
 * @param parts - The synth.
 * @param sound - Which one.
 */
function playOne(parts: Parts, sound: FoleySound): void {
  parts.master.gain.setTargetAtTime(MASTER * parts.volume, parts.context.currentTime, 0.01);
  if (sound === 'servo') demoServo(parts.servo);
  else if (sound === 'blink' || sound === 'squeak') parts.shots[sound](0.8);
  else parts.motif(tonesOf(sound));
}

/**
 * Start the synth.
 *
 * @param output - The voice's context and the node to play into.
 * @param random - The seeded source. Any variation comes from here, so a replay
 * sounds the same.
 * @returns The running synth.
 */
export function createFoley(output: FoleyOutput, random: () => number): Foley {
  const { context } = output;
  const master = context.createGain();
  master.gain.value = MASTER;
  master.connect(output.input);
  const bus: FoleyOutput = { context, input: master };
  const parts: Parts = {
    context,
    master,
    volume: 1,
    servo: startServo(bus),
    shots: oneShots(bus, blinkNoise(context, random)),
    motif(tones) {
      const pitch = 1 + (random() * 2 - 1) * DETUNE;
      for (const tone of tones) playTone(bus, tone, { pitch, gain: 1 });
    },
  };

  return {
    apply(cues, settings, ducked) {
      parts.volume = settings.volume;
      applyCues(parts, maskCues(cues, settings), ducked);
    },
    play(sound) {
      playOne(parts, sound);
    },
    stop() {
      parts.servo.stop();
      master.disconnect();
    },
  };
}
