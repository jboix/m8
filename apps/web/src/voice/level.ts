/**
 * Measures how a stretch of sound sounds: how loud and how bright. The eyes
 * move with these two numbers while he talks and while he listens.
 */

/** What one stretch of sound measured as. */
export interface SoundShape {
  /** Loudness, 0 silent to 1 loud speech. */
  level: number;
  /** Brightness, 0 dull to 1 bright. */
  brightness: number;
}

/** Below this root mean square it is room noise, not a voice. */
const NOISE_FLOOR = 0.012;

/** A root mean square this far over the floor counts as loud speech. */
const LOUD_SPAN = 0.16;

/**
 * The share of samples that cross zero in the brightest sounds of speech. An
 * "s" crosses on about a third of its samples at 16 kHz, a vowel on a twentieth.
 */
const BRIGHT_CROSSINGS = 0.3;

/** Nothing to hear. */
const SILENT: SoundShape = { level: 0, brightness: 0 };

/**
 * Hold a number inside 0 to 1.
 *
 * @param value - Any number.
 * @returns The nearest number inside the range.
 */
function unit(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/**
 * Measure one stretch of sound.
 *
 * @remarks
 * Loudness is the root mean square over the noise floor. Brightness is the zero
 * crossing rate, which costs one comparison a sample and needs no transform:
 * hissy consonants cross zero far more often than vowels do.
 *
 * @param samples - The sound.
 * @param fullScale - The value of the loudest possible sample: 1 for floats,
 * 32768 for PCM16.
 * @returns How loud and how bright it is. Silence measures as zero for both.
 */
export function measureSound(samples: ArrayLike<number>, fullScale: number): SoundShape {
  if (samples.length === 0) return SILENT;
  let energy = 0;
  let crossings = 0;
  let previous = samples[0] ?? 0;
  for (let index = 0; index < samples.length; index += 1) {
    const sample = samples[index] ?? 0;
    energy += sample * sample;
    if (sample >= 0 !== previous >= 0) crossings += 1;
    previous = sample;
  }
  const rms = Math.sqrt(energy / samples.length) / fullScale;
  const level = unit((rms - NOISE_FLOOR) / LOUD_SPAN);
  if (level === 0) return SILENT;
  return { level, brightness: unit(crossings / samples.length / BRIGHT_CROSSINGS) };
}
