/**
 * The browser's end of the live session. One socket to our own server, speaking
 * the protocol in `packages/shared` and nothing a provider would recognise.
 *
 * Section 11: this is one of only two modules allowed to send `senses.*`
 * messages up.
 */
import {
  DownMessage,
  type Listening,
  type SenseEvent,
  type SessionState,
  type Setup,
  type UpMessage,
  type Voice,
} from '@m8/shared';

/** What the client reports while it runs. */
export interface BrainHandlers {
  /** Where the live session is up to. */
  onState: (state: SessionState) => void;
  /** A chunk of the character's voice, PCM16 at 24 kHz. */
  onAudio: (pcm: ArrayBuffer) => void;
  /** A tool to carry out. Answer promptly or speech stalls. */
  onToolCall: (callId: string, input: Extract<DownMessage, { type: 'tool.call' }>['input']) => void;
  /** A tool the server carried out by itself, for the inspector to show. */
  onToolRan: (name: string, input: string) => void;
  /** Something was said, by either side. */
  onTranscript: (role: 'user' | 'model', text: string) => void;
  /** Barge-in: drop whatever is queued. */
  onInterrupted: () => void;
  /** The session ended on its own, which is something to recover from. */
  onClosed: () => void;
}

/** A running connection to the brain. */
export interface BrainClient {
  /**
   * Stream a frame of microphone audio.
   * @param pcm - PCM16 at 16 kHz.
   */
  sendAudio(pcm: ArrayBuffer): void;
  /**
   * Show the model one camera frame.
   * @param jpeg - The frame as base64 JPEG, without a data URL prefix.
   */
  sendFrame(jpeg: string): void;
  /**
   * Say something to the model without asking for a reply.
   * @param text - Usually an `[idle]` line.
   */
  note(text: string): void;
  /**
   * Say something and ask for a reply.
   * @param text - Usually an `[idle]` line.
   */
  interrupt(text: string): void;
  /**
   * Mark the start or the end of the person's turn. Only for a session that
   * was opened with the browser marking the turns.
   * @param state - `start` or `end`.
   */
  activity(state: 'start' | 'end'): void;
  /**
   * Answer a tool call.
   * @param callId - The id it came with.
   * @param ok - Whether it was carried out.
   * @param answer - What to tell the model, for a tool that answers with words.
   */
  answer(callId: string, ok: boolean, answer?: string): void;
  /**
   * Hand the server what the local senses picked up, for the session's log.
   * @param events - A batch, already limited to the kinds worth keeping.
   */
  sendEvents(events: SenseEvent[]): void;
  /** Close the session. */
  stop(): void;
}

/** What a session opens with. Changing any of it means opening another one. */
export interface Opening {
  /** Which of the model's voices he speaks with. */
  voice: Voice;
  /** The language and the name the setup screen collected. */
  who: Setup;
  /** Who marks the turns. It is part of the session's setup, so it reopens too. */
  listening: Listening;
  /**
   * The masked Gemini key and the live model. The server reads both from its
   * own settings; they are here so that changing either reopens the session.
   */
  upstream: string;
}

/**
 * Where the relay lives. Same origin, so the dev proxy and production behave
 * the same way and no URL is ever configured.
 *
 * @param opening - What the session opens with.
 * @returns The websocket URL.
 */
function relayUrl({ voice, who, listening }: Opening): string {
  const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
  const query = new URLSearchParams({
    voice,
    language: who.language,
    name: who.name,
    listening,
  });
  return `${protocol}://${location.host}/live?${query}`;
}

/**
 * Route everything the server says to the handlers.
 *
 * @param socket - The relay's socket.
 * @param handlers - Where each kind of message goes.
 */
function listen(socket: WebSocket, handlers: BrainHandlers): void {
  socket.addEventListener('message', (event) => {
    if (event.data instanceof ArrayBuffer) {
      handlers.onAudio(event.data);
      return;
    }
    const parsed = DownMessage.safeParse(JSON.parse(String(event.data)));
    if (parsed.success) receive(parsed.data, handlers);
  });
  socket.addEventListener('close', () => {
    handlers.onClosed();
  });
}

/**
 * Send one message up, if the socket is still open.
 *
 * @param socket - The relay's socket.
 * @param message - What to say.
 */
function sendUp(socket: WebSocket, message: UpMessage): void {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}

/**
 * The answer to a tool call, as the protocol wants it.
 *
 * @param callId - The id it came with.
 * @param ok - Whether it was carried out.
 * @param answer - What to tell the model, for a tool that answers with words.
 * @returns The message, without an `answer` field when there is none.
 */
function toolResult(callId: string, ok: boolean, answer?: string): UpMessage {
  return answer === undefined
    ? { type: 'tool.result', callId, ok }
    : { type: 'tool.result', callId, ok, answer };
}

/**
 * Open the session.
 *
 * @param handlers - What to do with everything the server says.
 * @param opening - What the session opens with.
 * @returns The client. It reports failures through `onState` rather than
 * throwing, because a brain that will not start is something the character
 * carries on without.
 */
export function connectBrain(handlers: BrainHandlers, opening: Opening): BrainClient {
  const socket = new WebSocket(relayUrl(opening));
  socket.binaryType = 'arraybuffer';
  const send = (message: UpMessage) => {
    sendUp(socket, message);
  };
  listen(socket, handlers);

  return {
    sendFrame: (jpeg) => {
      send({ type: 'vision.frame', jpeg });
    },
    sendAudio: (pcm) => {
      if (socket.readyState === WebSocket.OPEN) socket.send(pcm);
    },
    note: (text) => {
      send({ type: 'senses.note', text });
    },
    interrupt: (text) => {
      send({ type: 'senses.interrupt', text });
    },
    activity: (state) => {
      send({ type: 'senses.activity', state });
    },
    answer: (callId, ok, answer) => {
      send(toolResult(callId, ok, answer));
    },
    sendEvents: (events) => {
      send({ type: 'events.batch', events });
    },
    stop: () => {
      socket.close();
    },
  };
}

/**
 * Hand one message to the right handler.
 *
 * @param message - What the server said.
 * @param handlers - Where it goes.
 */
function receive(message: DownMessage, handlers: BrainHandlers): void {
  switch (message.type) {
    case 'session.state':
      handlers.onState(message);
      return;
    case 'tool.call':
      handlers.onToolCall(message.callId, message.input);
      return;
    case 'tool.ran':
      handlers.onToolRan(message.name, message.input);
      return;
    case 'transcript':
      handlers.onTranscript(message.role, message.text);
      return;
    case 'speech.interrupted':
      handlers.onInterrupted();
  }
}
