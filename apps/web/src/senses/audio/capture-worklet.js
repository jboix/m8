/**
 * Microphone capture. Posts a copy of the first input channel for every render
 * quantum, so the main thread receives the raw samples.
 *
 * Runs on the audio rendering thread in the AudioWorkletGlobalScope. It is
 * loaded by URL with `audioWorklet.addModule`, not bundled.
 */
registerProcessor(
  'm8-capture',
  class extends AudioWorkletProcessor {
    /**
     * Send the first channel of the first input to the main thread.
     *
     * @param {Float32Array[][]} inputs - The inputs, each a list of channels.
     * @returns {boolean} `true`, to keep the processor running.
     */
    process(inputs) {
      const channel = inputs[0]?.[0];
      // The engine reuses its buffers, so the samples are copied before sending.
      if (channel) this.port.postMessage(new Float32Array(channel));
      return true;
    }
  },
);
