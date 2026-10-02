/**
 * The second microphone track: the one with the processing turned off.
 *
 * Section 5.1. Echo cancellation, noise suppression and automatic gain are what
 * make a conversation work, and they are also exactly what scrubs out music, a
 * door, a dog and everything else the character might want to notice. So the
 * same device is opened twice, once processed for speech and once raw for
 * listening to the room.
 *
 * Two `getUserMedia` calls, not `clone` and `applyConstraints`: a clone keeps
 * its source's processing, and constraints applied to it are accepted and ignored.
 */
import captureWorkletUrl from './capture-worklet.js?url';
import { MicError } from './microphone.ts';
import { AMBIENT_RATE, type AmbientWindow, windower } from './windows.ts';

/** Everything off. The exact opposite of the processed track next door. */
const WANTED: MediaStreamConstraints = {
  audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
  video: false,
};

/** A running ambient ear. */
export interface Ambient {
  /** Stop listening and release the track. */
  stop(): Promise<void>;
}

/** The capture graph, kept so it can be torn down. */
interface Graph {
  context: AudioContext;
  source: MediaStreamAudioSourceNode;
  node: AudioWorkletNode;
}

/**
 * Build the graph: the raw stream into the same capture worklet the processed
 * track uses, out as windows.
 *
 * @param stream - The raw microphone.
 * @param onWindow - Where the windows go.
 * @returns The graph, already running.
 */
async function buildGraph(
  stream: MediaStream,
  onWindow: (window: AmbientWindow) => void,
): Promise<Graph> {
  const context = new AudioContext({ sampleRate: AMBIENT_RATE });
  await context.audioWorklet.addModule(captureWorkletUrl);
  const source = context.createMediaStreamSource(stream);
  const node = new AudioWorkletNode(context, 'm8-capture');
  const feed = windower(onWindow);
  node.port.onmessage = (event: MessageEvent<Float32Array>) => {
    feed(event.data);
  };
  source.connect(node);
  // Connecting to the destination is what keeps the worklet scheduled. It
  // writes no output, so nothing is audible.
  node.connect(context.destination);
  await context.resume();
  return { context, source, node };
}

/**
 * Open the raw track and hand out windows of the room.
 *
 * @param onWindow - Called about once a second.
 * @returns The running ear.
 * @throws {MicError} When the second track cannot be opened. The character
 * carries on without it: it can still hear speech.
 */
export async function startAmbient(onWindow: (window: AmbientWindow) => void): Promise<Ambient> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new MicError('unsupported', 'This browser has no microphone API.');
  }

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia(WANTED);
  } catch {
    throw new MicError('denied', 'The second, unprocessed microphone track could not be opened.');
  }

  const { context, source, node } = await buildGraph(stream, onWindow);
  return {
    async stop() {
      node.disconnect();
      source.disconnect();
      for (const track of stream.getTracks()) track.stop();
      if (context.state !== 'closed') await context.close();
    },
  };
}
