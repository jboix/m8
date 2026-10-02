/**
 * What the character's mind has to be able to do, whoever is providing it.
 * Section 7.1 of docs/architecture.md.
 *
 * The browser never sees any of this. It speaks the protocol in
 * `packages/shared`, and an adapter translates. That is what lets the model
 * change without the browser noticing.
 */
import type { TokenCounts, ToolInput } from '@m8/shared';

/** What a new session opens with. Section 9 of docs/architecture.md. */
export interface BootstrapPacket {
  /** The frozen core persona. */
  persona: string;
  /** What he remembers, rendered as text. It follows the persona. */
  memory: string;
}

/**
 * What the model did. A `tool_call` is for the browser to carry out, and a
 * `server_tool_call` is for the relay, with its arguments still unvalidated.
 * A `usage` is what one turn cost, as the provider counted it.
 */
export type BrainEvent =
  | { type: 'audio'; pcm: ArrayBuffer }
  | { type: 'tool_call'; callId: string; input: ToolInput }
  | { type: 'server_tool_call'; callId: string; name: string; args: Record<string, unknown> }
  | { type: 'transcript'; role: 'user' | 'model'; text: string }
  | { type: 'interrupted' }
  | { type: 'usage'; counts: TokenCounts }
  | { type: 'closed'; reason: string };

/** A live conversation with a model that hears and speaks. */
export interface RealtimeBrain {
  /**
   * Open the session.
   * @param bootstrap - What the character knows before anyone speaks.
   */
  connect(bootstrap: BootstrapPacket): Promise<void>;
  /**
   * Stream microphone audio.
   * @param pcm - PCM16 at 16 kHz, little endian.
   */
  sendAudio(pcm: ArrayBuffer): void;
  /**
   * Stream one camera frame. Realtime input, so it never interrupts
   * what the model is saying.
   * @param jpeg - The frame as base64 JPEG.
   */
  sendFrame(jpeg: string): void;
  /**
   * Mark the start or the end of the person's turn. Only meaningful in a
   * session opened with the model's own detector off; a `start` while he is
   * speaking interrupts him.
   * @param state - `start` or `end`.
   */
  sendActivity(state: 'start' | 'end'): void;
  /**
   * Append text without asking for a reply. Section 2's note.
   * @param text - The line, usually starting `[idle]`.
   */
  sendNote(text: string): void;
  /**
   * Append text and ask for a reply. Section 2's interrupt.
   * @param text - The line.
   */
  sendInterrupt(text: string): void;
  /**
   * Answer a tool the model called.
   * @param callId - The id it came with.
   * @param result - Whatever the executor produced.
   */
  sendToolResult(callId: string, result: unknown): void;
  /**
   * Listen to the session.
   * @param listener - Called for everything the model does.
   */
  on(listener: (event: BrainEvent) => void): void;
  /** Close the session. */
  close(): void;
}
