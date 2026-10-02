/**
 * The character's voice: a stream of small PCM16 chunks played as one
 * continuous line, and stopped mid-word when someone talks over it.
 *
 * Playback goes out through a media element rather than straight to the
 * context's destination. WebKit's echo canceller only covers what it renders
 * through a MediaStreamTrack, so audio played at the destination comes back up
 * the microphone uncancelled and the far end hears itself as a barge-in.
 */
import { VOICE_SAMPLE_RATE } from '@m8/shared';
import { bytesToPcm16, pcm16ToFloat32 } from '../senses/audio/pcm.ts';
import playbackWorkletUrl from '../senses/audio/playback-worklet.js?url';
import type { FoleyOutput } from './foley.ts';
import { measureSound, type SoundShape } from './level.ts';
import { createRobotVoice, type RobotVoice } from './robot.ts';
import { createSpeechClock, type SpeechClock } from './speech-clock.ts';

/** A running voice. */
export interface Voice {
  /**
   * Queue a chunk of the model's speech.
   * @param pcm - PCM16 at 24 kHz, as it arrived on the socket.
   */
  play(pcm: ArrayBuffer): void;
  /** Drop everything queued. Barge-in: stop now, do not finish the sentence. */
  clear(): void;
  /**
   * How much like a machine it sounds.
   * @param amount - 0 is the voice as the model sent it, 1 is the full effect.
   */
  setRobot(amount: number): void;
  /** Whether sound is currently going out of the speaker, hangover included. */
  speaking(): boolean;
  /**
   * How his voice sounds right now, measured at the speaker rather than as it
   * arrives, so whatever moves with it is in time with what is heard.
   * @returns Loudness and brightness, both zero when nothing is playing.
   */
  shape(): SoundShape;
  /**
   * Where the eyes' own sounds are played. It joins his voice before
   * the sink, so they leave through the same element and the echo canceller is
   * given them as part of its reference.
   */
  foley: FoleyOutput;
  /**
   * Cumulative speaker-active time. The echo canceller has to hear the signal
   * before it can subtract it, and this is its exposure so far.
   */
  spokenMs(): number;
  /** Tear the graph down. */
  stop(): Promise<void>;
}

/**
 * Send the voice to the speaker through a hidden `<audio>` element instead of
 * the context's destination. Safari's echo canceller only removes audio played
 * through a media element, so audio sent to the destination comes back up the
 * microphone and the model hears itself.
 *
 * @param context - The playback context.
 * @param node - The last node of the voice chain.
 * @returns The playing element, or `undefined` when the browser refused
 * playback. The caller then connects `node` to the destination.
 */
async function attachSink(
  context: AudioContext,
  node: AudioNode,
): Promise<HTMLAudioElement | undefined> {
  const destination = context.createMediaStreamDestination();
  node.connect(destination);
  const element = document.createElement('audio');
  element.srcObject = destination.stream;
  // iOS plays a media element only when it is in the document and inline.
  element.setAttribute('playsinline', '');
  element.hidden = true;
  document.body.append(element);
  try {
    await element.play();
    return element;
  } catch {
    node.disconnect(destination);
    element.remove();
    return undefined;
  }
}

/** How many samples the tap measures at once. About 40 ms at the voice's rate. */
const TAP_SAMPLES = 1024;

/**
 * Start the voice.
 *
 * @returns The running voice, silent until something is played.
 */
export async function startVoice(): Promise<Voice> {
  const context = new AudioContext({ sampleRate: VOICE_SAMPLE_RATE });
  await context.audioWorklet.addModule(playbackWorkletUrl);
  const node = new AudioWorkletNode(context, 'm8-playback');
  const clock = createSpeechClock();
  node.port.onmessage = (event: MessageEvent<{ type: string }>) => {
    if (event.data.type === 'playing') clock.started();
    else clock.drained();
  };

  // The effect sits before the sink, so what the echo canceller is given as its
  // reference is what actually comes out of the speaker.
  const robot = createRobotVoice(context);
  node.connect(robot.input);
  // His voice and the eyes' sounds meet here, and leave together.
  const mix = context.createGain();
  robot.output.connect(mix);
  const sink = await attachSink(context, mix);
  if (!sink) mix.connect(context.destination);
  // A tap, not a stage: an analyser with nothing connected after it changes
  // nothing about what is heard.
  const tap = context.createAnalyser();
  tap.fftSize = TAP_SAMPLES;
  robot.output.connect(tap);
  await context.resume();

  return voiceApi(context, { node, tap, mix }, clock, robot, sink);
}

/**
 * The voice's public surface, over a graph that is already running.
 *
 * @param context - The playback context.
 * @param graph - The worklet holding the queue, the tap that measures the
 * output, and the mix the eyes' sounds join at.
 * @param clock - Tracks whether and how long it has been speaking.
 * @param robot - The effect between the worklet and the speaker.
 * @param sink - The media element, when one was attached.
 * @returns The voice.
 */
function voiceApi(
  context: AudioContext,
  { node, tap, mix }: { node: AudioWorkletNode; tap: AnalyserNode; mix: GainNode },
  clock: SpeechClock,
  robot: RobotVoice,
  sink: HTMLAudioElement | undefined,
): Voice {
  const window = new Float32Array(TAP_SAMPLES);
  return {
    foley: { context, input: mix },
    shape() {
      tap.getFloatTimeDomainData(window);
      return measureSound(window, 1);
    },
    play(pcm) {
      clock.started();
      const samples = pcm16ToFloat32(bytesToPcm16(pcm));
      node.port.postMessage(samples, [samples.buffer]);
    },
    clear() {
      clock.stopped();
      node.port.postMessage({ type: 'clear' });
    },
    setRobot: (amount) => {
      robot.setAmount(amount);
    },
    speaking: () => clock.speaking(),
    spokenMs: () => clock.spokenMs(),
    async stop() {
      node.disconnect();
      sink?.remove();
      if (context.state !== 'closed') await context.close();
    },
  };
}
