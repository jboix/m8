/**
 * What the ambient worker is told and what it says back.
 *
 * The same shape as `senses/vision/findings.ts`, and a boundary for the same
 * reason it is not in `packages/shared`: both sides ship in the same bundle,
 * and what travels between modules is the sense events this eventually becomes.
 */
import type { Heard } from './derive-sound.ts';

/** Sent to the worker to start it. */
export interface StartMessage {
  type: 'start';
  /** Where the MediaPipe audio wasm loader lives, served by us. */
  wasmLoaderPath: string;
  /** Where its binary lives. */
  wasmBinaryPath: string;
  /** The YAMNet model. */
  model: string;
  /** The rate the windows are sampled at. */
  sampleRate: number;
}

/** Sent for each window of audio. The samples are transferred, not copied. */
export interface WindowMessage {
  type: 'window';
  samples: Float32Array;
  ts: number;
}

/** What the worker is told. */
export type ToWorker = StartMessage | WindowMessage;

/** What the worker says back. */
export type FromWorker =
  | { type: 'ready' }
  | { type: 'failed'; message: string }
  | { type: 'heard'; heard: Heard[]; ts: number };
