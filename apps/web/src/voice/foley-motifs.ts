/**
 * The little tunes the eyes make when he changes emotion: short, voice-less,
 * and recognisable by ear. Data only, so they can be read
 * and retuned without touching the synth.
 */
import type { Emotion, GestureKind } from '@m8/shared';

/** One gliding tone. */
export interface Tone {
  /** When it starts after the motif does, in milliseconds. */
  at: number;
  /** How long it lasts, in milliseconds. */
  ms: number;
  /** The pitch it starts on, in hertz. */
  from: number;
  /** The pitch it ends on. The same as `from` for a steady note. */
  to: number;
  /** The oscillator shape. Sine is soft, triangle is warm, square buzzes. */
  wave: OscillatorType;
  /** Its peak loudness, 0 to 1, before the master gain. */
  gain: number;
}

/** Every emotion's motif. Neutral has none: settling back is silent. */
export const MOTIFS: Record<Emotion, Tone[]> = {
  neutral: [],
  // A two-note lift.
  happy: [
    { at: 0, ms: 90, from: 660, to: 660, wave: 'triangle', gain: 0.7 },
    { at: 100, ms: 140, from: 880, to: 880, wave: 'triangle', gain: 0.7 },
  ],
  // A rising chirp, the sound of a head tilting.
  curious: [{ at: 0, ms: 200, from: 480, to: 920, wave: 'sine', gain: 0.7 }],
  // A quick leap up.
  // Down, then not quite back up.
  skeptical: [
    { at: 0, ms: 130, from: 520, to: 410, wave: 'triangle', gain: 0.6 },
    { at: 150, ms: 150, from: 410, to: 500, wave: 'triangle', gain: 0.6 },
  ],
  // A soft descending purr.
  sleepy: [{ at: 0, ms: 520, from: 300, to: 170, wave: 'triangle', gain: 0.5 }],
  // A falling tone.
  sad: [{ at: 0, ms: 420, from: 520, to: 320, wave: 'sine', gain: 0.6 }],
  // A low buzz.
  annoyed: [{ at: 0, ms: 230, from: 150, to: 135, wave: 'square', gain: 0.35 }],
  // Two small high notes, going down, quietly.
  shy: [
    { at: 0, ms: 70, from: 940, to: 940, wave: 'sine', gain: 0.35 },
    { at: 110, ms: 90, from: 820, to: 820, wave: 'sine', gain: 0.3 },
  ],
  // Three quick notes, climbing.
  excited: [
    { at: 0, ms: 60, from: 660, to: 660, wave: 'triangle', gain: 0.7 },
    { at: 75, ms: 60, from: 830, to: 830, wave: 'triangle', gain: 0.7 },
    { at: 150, ms: 110, from: 990, to: 1040, wave: 'triangle', gain: 0.75 },
  ],
  // A slow "hmm": down a little, then a small lift at the end.
  thinking: [
    { at: 0, ms: 280, from: 392, to: 360, wave: 'sine', gain: 0.5 },
    { at: 300, ms: 130, from: 360, to: 420, wave: 'sine', gain: 0.45 },
  ],
  // One short, level tick.
  focused: [{ at: 0, ms: 60, from: 440, to: 440, wave: 'sine', gain: 0.5 }],
  // A nervous warble: four quick notes that wobble and do not settle.
  stressed: [
    { at: 0, ms: 55, from: 560, to: 600, wave: 'triangle', gain: 0.45 },
    { at: 70, ms: 55, from: 520, to: 560, wave: 'triangle', gain: 0.45 },
    { at: 140, ms: 55, from: 580, to: 620, wave: 'triangle', gain: 0.45 },
    { at: 210, ms: 80, from: 530, to: 500, wave: 'triangle', gain: 0.4 },
  ],
  // A quick leap up, and a hard stop on top.
  shocked: [
    { at: 0, ms: 70, from: 380, to: 1500, wave: 'sine', gain: 0.85 },
    { at: 80, ms: 90, from: 1500, to: 1500, wave: 'square', gain: 0.25 },
  ],
};

/** A rubbery squeak: a fast glide up. Loudness is set by how hard the squash was. */
export const SQUEAK: Tone = { at: 0, ms: 75, from: 700, to: 1150, wave: 'sine', gain: 0.5 };

/**
 * Every gesture's sound, played as it starts. Nothing plays when one ends: a
 * low note on every return to normal sounded like a heartbeat.
 */
export const GESTURE_SOUNDS: Record<GestureKind, Tone[]> = {
  // The same blip twice: look, and look again.
  double_take: [
    { at: 0, ms: 45, from: 720, to: 720, wave: 'sine', gain: 0.6 },
    { at: 150, ms: 55, from: 720, to: 780, wave: 'sine', gain: 0.7 },
  ],
  // Up and over, slowly.
  eye_roll: [
    { at: 0, ms: 260, from: 400, to: 720, wave: 'sine', gain: 0.5 },
    { at: 260, ms: 320, from: 720, to: 340, wave: 'sine', gain: 0.5 },
  ],
  // A narrow creak down.
  squint: [{ at: 0, ms: 230, from: 390, to: 300, wave: 'triangle', gain: 0.45 }],
  // A quick boing up.
  wide_eyes: [{ at: 0, ms: 120, from: 480, to: 1020, wave: 'triangle', gain: 0.65 }],
  // Soft, low and unhurried.
  slow_blink: [{ at: 0, ms: 360, from: 270, to: 200, wave: 'sine', gain: 0.35 }],
  // Down, up: yes.
  nod: [
    { at: 0, ms: 70, from: 440, to: 440, wave: 'sine', gain: 0.5 },
    { at: 110, ms: 90, from: 550, to: 550, wave: 'sine', gain: 0.55 },
  ],
  // Side to side: no.
  shake: [
    { at: 0, ms: 50, from: 600, to: 600, wave: 'triangle', gain: 0.5 },
    { at: 80, ms: 50, from: 500, to: 500, wave: 'triangle', gain: 0.5 },
    { at: 160, ms: 60, from: 600, to: 600, wave: 'triangle', gain: 0.5 },
  ],
  // A breath in, then a long slide down.
  yawn: [
    { at: 0, ms: 520, from: 230, to: 410, wave: 'sine', gain: 0.35 },
    { at: 520, ms: 1100, from: 410, to: 160, wave: 'sine', gain: 0.3 },
  ],
};
