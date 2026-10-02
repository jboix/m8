/**
 * Conversion between the Web Audio API's Float32 and the PCM16 the live session
 * speaks. No DOM here, so it is testable on its own, which matters because
 * getting it wrong sounds like static rather than failing.
 */

/** Largest magnitude of a signed 16-bit sample. */
const SCALE = 0x8000;

/**
 * Float32 samples to signed 16-bit PCM.
 *
 * @param input - Samples in -1 to 1. Values outside are clamped rather than
 * wrapping, which would turn a loud voice into a buzz.
 * @returns The samples as PCM16.
 */
export function float32ToPcm16(input: Float32Array): Int16Array {
  const out = new Int16Array(input.length);
  for (let index = 0; index < input.length; index++) {
    const clamped = Math.max(-1, Math.min(1, input[index] ?? 0));
    out[index] = clamped < 0 ? clamped * SCALE : clamped * (SCALE - 1);
  }
  return out;
}

/**
 * Signed 16-bit PCM to Float32 samples.
 *
 * @param input - The PCM16 samples.
 * @returns The samples in -1 to 1.
 */
export function pcm16ToFloat32(input: Int16Array): Float32Array {
  const out = new Float32Array(input.length);
  for (let index = 0; index < input.length; index++) out[index] = (input[index] ?? 0) / SCALE;
  return out;
}

/**
 * Read PCM16 out of bytes that may not be two-byte aligned.
 *
 * @param bytes - Raw little-endian PCM16.
 * @returns The samples. A trailing odd byte is dropped.
 */
export function bytesToPcm16(bytes: ArrayBuffer): Int16Array {
  // Copied rather than viewed, because a websocket frame's buffer offset is not
  // guaranteed to be even and Int16Array refuses an odd one.
  const aligned = new Uint8Array(bytes.byteLength - (bytes.byteLength % 2));
  aligned.set(new Uint8Array(bytes, 0, aligned.length));
  return new Int16Array(aligned.buffer);
}
