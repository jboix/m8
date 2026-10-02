/**
 * Voice playback. Holds a queue of Float32 chunks and drains them into the
 * output, so the model's speech plays continuously across the many small frames
 * it arrives in.
 *
 * Runs on the audio rendering thread in its own realm. A `clear` message drops
 * everything queued, which is what barge-in needs: the character has to stop
 * mid-word, not finish the sentence.
 */
registerProcessor(
  'm8-playback',
  class extends AudioWorkletProcessor {
    constructor() {
      super();
      this.queue = [];
      this.offset = 0;
      this.draining = false;
      this.port.onmessage = (event) => {
        if (event.data?.type === 'clear') {
          this.queue = [];
          this.offset = 0;
          return;
        }
        this.queue.push(event.data);
      };
    }

    /** One sample out of the queue, or silence when it has run dry. */
    next() {
      const chunk = this.queue[0];
      if (!chunk) return 0;
      const sample = chunk[this.offset] ?? 0;
      this.offset += 1;
      if (this.offset >= chunk.length) {
        this.queue.shift();
        this.offset = 0;
      }
      return sample;
    }

    process(_inputs, outputs) {
      const output = outputs[0]?.[0];
      if (!output) return true;
      for (let index = 0; index < output.length; index++) output[index] = this.next();

      const empty = this.queue.length === 0;
      if (empty !== this.draining) {
        this.draining = empty;
        this.port.postMessage({ type: empty ? 'drained' : 'playing' });
      }
      return true;
    }
  },
);
