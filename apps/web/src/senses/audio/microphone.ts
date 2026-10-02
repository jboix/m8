/**
 * The microphone, as PCM16 at the rate the live session wants.
 *
 * Section 5.1 asks for two tracks, one processed for speech and one raw for
 * ambient sound. This is the processed one; the raw one is `ambient.ts`.
 */
import { MIC_SAMPLE_RATE } from '@m8/shared';
import { beginCallAudioSession, restoreAudioSession } from './audio-session.ts';
import captureWorkletUrl from './capture-worklet.js?url';
import { float32ToPcm16 } from './pcm.ts';

/** Why the microphone is not running. Each has something different to tell a person. */
export type MicFault = 'insecure' | 'unsupported' | 'denied' | 'missing' | 'in-use' | 'unknown';

/** A microphone that failed to open, with something a person can act on. */
export class MicError extends Error {
  /** Which kind of failure this is. */
  readonly fault: MicFault;

  /**
   * @param fault - Which kind of failure.
   * @param message - What to show. Written for a person, not a log.
   */
  constructor(fault: MicFault, message: string) {
    super(message);
    this.name = 'MicError';
    this.fault = fault;
  }
}

/** What to say for each thing that can go wrong. */
const EXPLANATION: Record<MicFault, string> = {
  insecure:
    'The microphone needs https, or localhost. This page is on plain http, so the browser hides it entirely.',
  unsupported: 'This browser has no microphone API.',
  denied: 'The microphone was blocked. Allow it in the address bar and try again.',
  missing: 'No microphone is connected.',
  'in-use': 'The microphone is already in use by another application.',
  unknown: 'The microphone could not be opened.',
};

/**
 * The processed track: everything that makes a conversation work is on. The raw
 * track turns all three off, which is the point of having two.
 */
const WANTED: MediaStreamConstraints = {
  audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  video: false,
};

/**
 * Work out which fault a `getUserMedia` rejection was.
 *
 * @param error - Whatever it threw.
 * @returns The fault it maps to.
 */
function faultOf(error: unknown): MicFault {
  const name = error instanceof DOMException ? error.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'denied';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'missing';
  if (name === 'NotReadableError' || name === 'AbortError') return 'in-use';
  return 'unknown';
}

/**
 * Ask for the microphone, turning a rejection into something readable.
 *
 * @param priorSession - Restored if the request fails, so a refused microphone
 * does not leave the platform in call mode.
 * @returns The stream.
 * @throws {MicError} With the fault it mapped to.
 */
async function openStream(
  priorSession: ReturnType<typeof beginCallAudioSession>,
): Promise<MediaStream> {
  try {
    return await navigator.mediaDevices.getUserMedia(WANTED);
  } catch (error) {
    restoreAudioSession(priorSession);
    const fault = faultOf(error);
    throw new MicError(fault, EXPLANATION[fault]);
  }
}

/** The pieces of the capture graph, kept so they can be torn down. */
interface Graph {
  context: AudioContext;
  source: MediaStreamAudioSourceNode;
  node: AudioWorkletNode;
}

/**
 * Build the capture graph: the stream into a worklet, out as PCM16.
 *
 * @param stream - The microphone.
 * @param onFrame - Called with each frame.
 * @returns The graph, already running.
 */
async function buildGraph(
  stream: MediaStream,
  onFrame: (pcm: ArrayBuffer) => void,
): Promise<Graph> {
  // The context runs at the rate the session wants, so nothing has to resample.
  const context = new AudioContext({ sampleRate: MIC_SAMPLE_RATE });
  await context.audioWorklet.addModule(captureWorkletUrl);
  const source = context.createMediaStreamSource(stream);
  const node = new AudioWorkletNode(context, 'm8-capture');
  node.port.onmessage = (event: MessageEvent<Float32Array>) => {
    const pcm = float32ToPcm16(event.data);
    onFrame(pcm.buffer as ArrayBuffer);
  };
  source.connect(node);
  // Connecting to the destination is what keeps the worklet scheduled. It
  // writes no output, so nothing is audible.
  node.connect(context.destination);
  await context.resume();
  return { context, source, node };
}

/** A running microphone. */
export interface Microphone {
  /** Stop capturing and turn the indicator off. */
  stop(): Promise<void>;
}

/**
 * Open the microphone and stream it as PCM16.
 *
 * @param onFrame - Called with each frame, ready to go up the socket.
 * @returns The running microphone.
 * @throws {MicError} With a `fault` saying which of the six things went wrong.
 */
export async function startMicrophone(onFrame: (pcm: ArrayBuffer) => void): Promise<Microphone> {
  if (!globalThis.isSecureContext) throw new MicError('insecure', EXPLANATION.insecure);
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new MicError('unsupported', EXPLANATION.unsupported);
  }

  // Declared before capture so the platform sets the call route up front.
  const priorSession = beginCallAudioSession();
  const stream = await openStream(priorSession);
  const { context, source, node } = await buildGraph(stream, onFrame);

  return {
    async stop() {
      node.disconnect();
      source.disconnect();
      for (const track of stream.getTracks()) track.stop();
      if (context.state !== 'closed') await context.close();
      // After the tracks stop, so the route is torn down once rather than
      // renegotiated under a live microphone.
      restoreAudioSession(priorSession);
    },
  };
}
