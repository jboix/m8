/**
 * The first `RealtimeBrain`: Gemini Live over its own websocket.
 *
 * Two things this file depends on are not in the provider's guide: transcripts have to be asked
 * for, and the voice comes back at 24 kHz.
 */
import {
  type Listening,
  MIC_SAMPLE_RATE,
  TOOL_NAMES,
  type ToolInput,
  type ToolName,
  tools,
  type Voice,
} from '@m8/shared';
import { z } from 'zod';
import { countsFrom } from '../gemini/usage-metadata.ts';
import { toGeminiParameters } from './tool-schema.ts';
import type { BootstrapPacket, BrainEvent, RealtimeBrain } from './types.ts';

/** Where the Live API lives. The key goes in the query string; it never leaves here. */
const ENDPOINT =
  'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent';

/** What the model sends back. Only the parts we act on are described. */
const ServerMessage = z.object({
  setupComplete: z.unknown().optional(),
  // One per turn, on the frame that completes it. The prompt count is the
  // whole context the turn read, so each turn is charged for all of it.
  usageMetadata: z.unknown().optional(),
  toolCall: z
    .object({
      functionCalls: z.array(
        z.object({
          id: z.string().optional(),
          name: z.string(),
          args: z.record(z.string(), z.unknown()),
        }),
      ),
    })
    .optional(),
  serverContent: z
    .object({
      modelTurn: z
        .object({
          parts: z.array(z.object({ inlineData: z.object({ data: z.string() }).optional() })),
        })
        .optional(),
      inputTranscription: z.object({ text: z.string() }).optional(),
      outputTranscription: z.object({ text: z.string() }).optional(),
      interrupted: z.boolean().optional(),
    })
    .optional(),
});

/** How the adapter is built. */
export interface GeminiLiveOptions {
  /** The model, as chosen in the settings. Never written down here. */
  model: string;
  /** The API key. Server side only. */
  apiKey: string;
  /** Which voice it speaks with. */
  voice: Voice;
  /** Who marks the turns: the model's own detector, or the browser. */
  listening: Listening;
  /** How much of the conversation every turn re-reads, in tokens. */
  context: { trigger: number; target: number };
}

/**
 * Build the function declarations the model is offered, from the one registry.
 *
 * @returns Gemini's `tools` array, holding every tool in the registry.
 */
function declarations() {
  return [
    {
      functionDeclarations: TOOL_NAMES.map((name) => ({
        name,
        description: tools[name].description,
        parameters: toGeminiParameters(tools[name].input),
      })),
    },
  ];
}

/**
 * Open a live session with Gemini.
 *
 * @param options - The model and the key.
 * @returns The brain, not yet connected.
 */
export function createGeminiLive(options: GeminiLiveOptions): RealtimeBrain {
  const wire: Wire = { socket: null };
  let listener: (event: BrainEvent) => void = () => {};
  const emit = (brainEvent: BrainEvent) => {
    listener(brainEvent);
  };

  return {
    connect: (bootstrap) =>
      new Promise<void>((ready, failed) => {
        wire.socket = openSession(options, bootstrap, { ready, failed, emit });
      }),
    sendAudio: (pcm) => {
      send(wire, audioFrame(pcm));
    },
    sendFrame: (jpeg) => {
      send(wire, { realtimeInput: { video: { data: jpeg, mimeType: 'image/jpeg' } } });
    },
    sendActivity: (state) => {
      send(wire, activityFrame(state));
    },
    sendNote: (text) => {
      appendText(wire, text, false);
    },
    sendInterrupt: (text) => {
      appendText(wire, text, true);
    },
    sendToolResult: (callId, result) => {
      send(wire, { toolResponse: { functionResponses: [{ id: callId, response: { result } }] } });
    },
    on: (next) => {
      listener = next;
    },
    close: () => {
      wire.socket?.close();
      wire.socket = null;
    },
  };
}

/** The one mutable thing the adapter owns. */
interface Wire {
  /** The live socket, or `null` before connecting and after closing. */
  socket: WebSocket | null;
}

/**
 * Send one JSON frame, if the socket is still up.
 *
 * @param wire - The socket holder.
 * @param message - The frame.
 */
function send(wire: Wire, message: unknown): void {
  if (wire.socket?.readyState === WebSocket.OPEN) wire.socket.send(JSON.stringify(message));
}

/**
 * Append text to the conversation.
 *
 * @param wire - The socket holder.
 * @param text - The line.
 * @param answer - True asks for a reply. False leaves it silently in context,
 * which is section 2's note.
 */
function appendText(wire: Wire, text: string, answer: boolean): void {
  send(wire, {
    clientContent: { turns: [{ role: 'user', parts: [{ text }] }], turnComplete: answer },
  });
}

/**
 * One chunk of microphone audio, as the Live API wants it.
 *
 * @param pcm - PCM16 at 16 kHz, little endian.
 * @returns The frame.
 */
function audioFrame(pcm: ArrayBuffer) {
  return {
    realtimeInput: {
      audio: {
        data: Buffer.from(pcm).toString('base64'),
        mimeType: `audio/pcm;rate=${MIC_SAMPLE_RATE}`,
      },
    },
  };
}

/**
 * One edge of the person's turn, as the Live API wants it.
 *
 * @param state - `start` or `end`.
 * @returns The frame. Realtime input, like the audio it brackets.
 */
function activityFrame(state: 'start' | 'end') {
  return { realtimeInput: state === 'start' ? { activityStart: {} } : { activityEnd: {} } };
}

/**
 * The part of the setup that says who marks the turns.
 *
 * @param listening - Who marks them.
 * @returns Nothing for `everyone`, which leaves the model's own detector on.
 * Otherwise the detector is switched off and the browser's `activityStart`
 * and `activityEnd` are the only turns there are.
 */
function turnMarking(listening: Listening) {
  if (listening === 'everyone') return {};
  return { realtimeInputConfig: { automaticActivityDetection: { disabled: true } } };
}

/**
 * The part of the setup that lets the context slide.
 *
 * @param context - The size at which it slides, and what it slides down to, in tokens.
 * @returns The compression settings. A session that carries video ends after
 * two minutes unless its context is allowed to slide, and every turn is
 * charged for the whole context, so it slides at a size we choose rather than
 * wherever the model's own default puts it.
 */
function sliding(context: GeminiLiveOptions['context']) {
  return { triggerTokens: context.trigger, slidingWindow: { targetTokens: context.target } };
}

/** What `openSession` reports back to the adapter. */
interface SessionHooks {
  /** Called once the model acknowledges the setup. */
  ready: () => void;
  /** Called when the socket could not be opened at all. */
  failed: (error: Error) => void;
  /** Called for everything else. */
  emit: (event: BrainEvent) => void;
}

/**
 * Open the socket and configure the session.
 *
 * @param options - The model and the key.
 * @param bootstrap - What the character knows before anyone speaks.
 * @param hooks - Where the session reports to.
 * @returns The socket, already connecting.
 */
function openSession(
  options: GeminiLiveOptions,
  bootstrap: BootstrapPacket,
  hooks: SessionHooks,
): WebSocket {
  const live = new WebSocket(`${ENDPOINT}?key=${options.apiKey}`);
  live.addEventListener('message', (event) => {
    void handleMessage(event, hooks.ready, hooks.emit);
  });
  live.addEventListener('error', () => {
    hooks.failed(new Error('the live session could not be opened'));
  });
  live.addEventListener('close', (event) => {
    const reason = event.reason || `code ${event.code}`;
    // A setup frame Gemini will not accept is answered by closing the socket,
    // not by an error, so without this `connect` waits for a session that is
    // never coming.
    hooks.failed(new Error(`the live session closed: ${reason}`));
    hooks.emit({ type: 'closed', reason });
  });
  live.addEventListener('open', () => {
    live.send(
      JSON.stringify({
        setup: {
          model: `models/${options.model}`,
          generationConfig: {
            responseModalities: ['AUDIO'],
            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: options.voice } } },
          },
          systemInstruction: { parts: [{ text: bootstrap.persona }, { text: bootstrap.memory }] },
          tools: declarations(),
          ...turnMarking(options.listening),
          contextWindowCompression: sliding(options.context),
          // Both are off unless asked for, and the session inspector has
          // nothing to show without them.
          inputAudioTranscription: {},
          outputAudioTranscription: {},
        },
      }),
    );
  });
  return live;
}

/**
 * Turn one frame from the model into events.
 *
 * @param event - The websocket message.
 * @param ready - Resolved once the session is set up.
 * @param emit - Where the events go.
 */
async function handleMessage(
  event: MessageEvent,
  ready: () => void,
  emit: (brainEvent: BrainEvent) => void,
): Promise<void> {
  const raw = event.data instanceof Blob ? await event.data.text() : String(event.data);
  const parsed = ServerMessage.safeParse(JSON.parse(raw));
  if (!parsed.success) return;
  const message = parsed.data;

  if (message.setupComplete) {
    ready();
    return;
  }
  for (const call of message.toolCall?.functionCalls ?? []) emit(toToolEvent(call));
  if (message.serverContent) emitContent(message.serverContent, emit);
  if (message.usageMetadata) emit({ type: 'usage', counts: countsFrom(message.usageMetadata) });
}

/** One function call, as Gemini sends it. */
type FunctionCall = NonNullable<z.infer<typeof ServerMessage>['toolCall']>['functionCalls'][number];

/**
 * Decide who carries out a tool the model called.
 *
 * @param call - The function call.
 * @returns A `tool_call` for the browser, or a `server_tool_call` for the relay.
 */
function toToolEvent(call: FunctionCall): BrainEvent {
  const callId = call.id ?? call.name;
  if (tools[call.name as ToolName]?.executor === 'server') {
    return { type: 'server_tool_call', callId, name: call.name, args: call.args };
  }
  return { type: 'tool_call', callId, input: { name: call.name, ...call.args } as ToolInput };
}

/** What one `serverContent` frame carries. */
type ServerContent = NonNullable<z.infer<typeof ServerMessage>['serverContent']>;

/**
 * Turn one content frame into events: the barge-in, both transcripts, and the
 * voice itself.
 *
 * @param content - The frame.
 * @param emit - Where the events go.
 */
function emitContent(content: ServerContent, emit: (brainEvent: BrainEvent) => void): void {
  if (content.interrupted) emit({ type: 'interrupted' });
  if (content.inputTranscription?.text) {
    emit({ type: 'transcript', role: 'user', text: content.inputTranscription.text });
  }
  if (content.outputTranscription?.text) {
    emit({ type: 'transcript', role: 'model', text: content.outputTranscription.text });
  }
  for (const part of content.modelTurn?.parts ?? []) {
    if (part.inlineData) emit({ type: 'audio', pcm: decode(part.inlineData.data) });
  }
}

/**
 * Base64 to raw bytes.
 *
 * @param base64 - The encoded audio.
 * @returns Its bytes.
 */
function decode(base64: string): ArrayBuffer {
  const bytes = Buffer.from(base64, 'base64');
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}
