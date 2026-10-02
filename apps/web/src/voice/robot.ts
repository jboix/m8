/**
 * Makes the character sound like it is coming out of a small machine.
 *
 * Three stages, none of which distort:
 *
 * A narrow band, because a small speaker reproduces neither the bottom nor the
 * top of a voice. This does most of the work on its own.
 *
 * A comb filter: the signal added to a copy of itself a couple of milliseconds
 * late, which cancels and reinforces at regular intervals across the spectrum.
 * That is the resonance of a small plastic box, and it is what reads as a toy.
 *
 * A shallow ring modulator for a warble underneath.
 *
 * There is deliberately no waveshaper. Saturation is what makes a voice sound
 * raspy and broken rather than small and synthetic, and it was doing most of the
 * damage here.
 *
 * The chain sits between the playback worklet and the media element, so the
 * processed voice is what the echo canceller is given as its reference.
 * Processing after that point would leave it subtracting a sound nobody hears.
 */

/** Low end of the band. Below this is chest, which a small speaker has none of. */
const BAND_LOW = 320;

/** Top of the band. Above this is air, which a small speaker also has none of. */
const BAND_HIGH = 3200;

/** Comb delay. Short enough to colour the tone rather than be heard as an echo. */
const COMB_SECONDS = 0.0022;

/** How much of the comb comes back round. Below 1, or it rings forever. */
const COMB_FEEDBACK = 0.62;

/** Ring modulator frequency. A warble, not a buzz. */
const RING_HZ = 31;

/** How much of the signal the ring modulator replaces at full strength. */
const RING_DEPTH = 0.3;

/** A running effect. */
export interface RobotVoice {
  /** Feed the dry signal in here. */
  input: AudioNode;
  /** Take the processed signal from here. */
  output: AudioNode;
  /**
   * How machine it sounds.
   * @param amount - 0 leaves the voice alone, 1 is the full effect. Everything
   * in between is a straight crossfade, so the control is predictable.
   */
  setAmount(amount: number): void;
}

/**
 * The band a small speaker can reproduce.
 *
 * @param context - The playback context.
 * @returns Where to feed it and where to take it from.
 */
function buildBand(context: AudioContext): { input: AudioNode; output: AudioNode } {
  const high = context.createBiquadFilter();
  high.type = 'highpass';
  high.frequency.value = BAND_LOW;
  const low = context.createBiquadFilter();
  low.type = 'lowpass';
  low.frequency.value = BAND_HIGH;
  high.connect(low);
  return { input: high, output: low };
}

/**
 * A comb filter: a short delay fed back on itself, which gives the hollow
 * resonance of a small plastic box.
 *
 * @param context - The playback context.
 * @returns Where to feed it and where to take it from.
 */
function buildComb(context: AudioContext): { input: AudioNode; output: AudioNode } {
  const input = context.createGain();
  const output = context.createGain();
  const delay = context.createDelay(0.05);
  delay.delayTime.value = COMB_SECONDS;
  const feedback = context.createGain();
  feedback.gain.value = COMB_FEEDBACK;

  input.connect(output);
  input.connect(delay);
  delay.connect(feedback).connect(delay);
  delay.connect(output);
  return { input, output };
}

/**
 * A ring modulator, and the unmodulated path it is blended against.
 *
 * @remarks
 * A gain node with no gain of its own, driven by an oscillator, multiplies its
 * input rather than mixing with it. That multiplication is what ring modulation
 * is, and what makes a voice metallic rather than merely distorted.
 *
 * @param context - The playback context.
 * @returns The two paths, and the control over how much is modulated.
 */
function buildRing(context: AudioContext) {
  const ring = context.createGain();
  ring.gain.value = 0;
  const carrier = context.createOscillator();
  carrier.type = 'sine';
  carrier.frequency.value = RING_HZ;
  const depth = context.createGain();
  depth.gain.value = 0;
  carrier.connect(depth).connect(ring.gain);
  carrier.start();
  return { ring, depth, straight: context.createGain() };
}

/**
 * Build the effect.
 *
 * @param context - The playback context.
 * @returns The chain, dry until an amount is set.
 */
export function createRobotVoice(context: AudioContext): RobotVoice {
  const input = context.createGain();
  const output = context.createGain();
  const dry = context.createGain();
  const wet = context.createGain();
  input.connect(dry).connect(output);

  const band = buildBand(context);
  const comb = buildComb(context);
  const { ring, depth, straight } = buildRing(context);

  input.connect(band.input);
  band.output.connect(comb.input);
  comb.output.connect(ring).connect(wet);
  comb.output.connect(straight).connect(wet);
  wet.connect(output);

  const chain: RobotVoice = {
    input,
    output,
    setAmount(amount) {
      const mix = Math.min(1, Math.max(0, amount));
      dry.gain.value = 1 - mix;
      // The band and the comb both lose energy, so the wet path is lifted to
      // meet the dry one and the slider changes character rather than volume.
      wet.gain.value = mix * 1.6;
      depth.gain.value = RING_DEPTH * mix;
      straight.gain.value = 1 - RING_DEPTH * mix;
    },
  };
  chain.setAmount(0);
  return chain;
}
