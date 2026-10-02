/**
 * The relay. One websocket from the browser, one live session upstream, and the
 * translation between them.
 *
 * Section 3: the browser never talks to a provider. It holds this socket, and
 * the key, the transcripts and the tool calls all stay on this side, which is
 * what lets the server log a session, inject memory at connect time, and
 * execute the tools the browser cannot.
 */

import type { Database } from 'bun:sqlite';
import {
  CONTEXT_TOKENS,
  DEFAULT_LANGUAGE,
  DEFAULT_LISTENING,
  DEFAULT_VOICE,
  type DownMessage,
  LanguageCode,
  ListeningChoice,
  PersonName,
  type TokenCounts,
  UpMessage,
  VoiceName,
} from '@m8/shared';
import { Hono } from 'hono';
import { createBunWebSocket } from 'hono/bun';
import type { WSContext } from 'hono/ws';
import { createGeminiLive } from '../brain/gemini-live.ts';
import type { BrainEvent, RealtimeBrain } from '../brain/types.ts';
import type { GeminiAccount } from '../gemini/account.ts';
import type { Completer } from '../gemini/text.ts';
import { keepSession, type SessionKeeper } from '../memory/keeper.ts';
import { personaFor } from '../persona.ts';
import { runServerTool } from '../tools/index.ts';
import { endCall, recordTurn } from '../usage/ledger.ts';

const { upgradeWebSocket, websocket } = createBunWebSocket();

/** Bun needs this alongside `fetch` for any of the upgrades to work. */
export { websocket };

/**
 * Send one message down to the browser.
 *
 * @param socket - The browser's socket.
 * @param message - What to say.
 */
function tell(socket: WSContext, message: DownMessage): void {
  socket.send(JSON.stringify(message));
}

/** What a connect carries in its query string. None of it is trusted. */
interface Asked {
  /** The voice to speak with. */
  voice: string | undefined;
  /** The code of the only language he speaks. */
  language: string | undefined;
  /** Who set him up. */
  name: string | undefined;
  /** Who marks the turns. */
  listening: string | undefined;
}

/** What transcripts and summaries call a person with no name. */
const SOMEBODY = 'Somebody';

/** What the relay is built from. */
export interface LiveDeps {
  /** Supplies the key and the live model, and counts the session against the daily limit. */
  account: GeminiAccount;
  /** The memory. */
  db: Database;
  /** Asks the memory model, within the daily limit. */
  complete: Completer;
}

/** One browser's live session: the model upstream, and its place in the memory. */
interface Conversation {
  /** The live session. */
  brain: RealtimeBrain;
  /** What is kept of it. */
  keeper: SessionKeeper;
  /** The live model, for the usage ledger. */
  model: string;
  /** The session's call row in the usage ledger, ended when the session ends. */
  usageId: number;
}

/**
 * Open the upstream session and pipe everything it says to the browser.
 *
 * @param deps - The account and the memory.
 * @param socket - The browser's socket.
 * @param asked - What the connect asked for, unvalidated.
 * @returns The conversation, once it is live.
 * @throws {Error} When there is no key, the daily limit is reached, or the session will not open.
 */
async function openConversation(
  deps: LiveDeps,
  socket: WSContext,
  asked: Asked,
): Promise<Conversation> {
  const { account, db } = deps;
  const persona = await personaFor(asked);
  const keeper = keepSession(
    { db, complete: deps.complete, now: Date.now },
    {
      person: PersonName.safeParse(asked.name).data ?? SOMEBODY,
      language: LanguageCode.safeParse(asked.language).data ?? DEFAULT_LANGUAGE,
      persona,
    },
  );
  const call = await account
    .forCall('live', { purpose: 'conversation', sessionId: keeper.sessionId })
    .catch((error: unknown) => {
      keeper.end('failed');
      throw error;
    });
  const brain = createGeminiLive({
    model: call.model,
    apiKey: call.apiKey,
    // Anything unrecognised falls back rather than failing: a stale bookmark
    // should not be the reason the character cannot speak.
    voice: VoiceName.safeParse(asked.voice).data ?? DEFAULT_VOICE,
    listening: ListeningChoice.safeParse(asked.listening).data ?? DEFAULT_LISTENING,
    context: CONTEXT_TOKENS[call.context],
  });
  return connect(
    { brain, keeper, model: call.model, usageId: call.usageId },
    { db, socket, persona },
  );
}

/**
 * Wire a conversation to the browser and open it.
 *
 * @param conversation - The session and its keeper, not yet connected.
 * @param wiring - The memory, the browser's socket, and the persona to open with.
 * @returns The same conversation, live.
 * @throws {Error} When the session will not open. The keeper is closed first.
 */
async function connect(
  conversation: Conversation,
  wiring: { db: Database; socket: WSContext; persona: string },
): Promise<Conversation> {
  const { brain, keeper } = conversation;
  brain.on((event) => {
    relayDown(conversation, wiring, event);
  });
  try {
    await brain.connect({ persona: wiring.persona, memory: keeper.memory });
  } catch (error) {
    endConversation(conversation, wiring.db, 'failed');
    throw error;
  }
  keeper.attend((text) => {
    brain.sendNote(text);
  });
  return conversation;
}

/**
 * Carry out a tool the server owns, answer the model, and tell the panel.
 *
 * @param conversation - The session the call came from.
 * @param wiring - The memory and the browser's socket.
 * @param call - The call, its arguments unvalidated.
 */
function runTool(
  conversation: Conversation,
  wiring: { db: Database; socket: WSContext },
  call: Extract<BrainEvent, { type: 'server_tool_call' }>,
): void {
  const result = runServerTool(wiring.db, call, Date.now());
  // Answered before anything else: the model says nothing until this arrives.
  conversation.brain.sendToolResult(call.callId, result);
  conversation.keeper.ranTool(call, result);
  if (call.name !== 'remember' && call.name !== 'recall') return;
  tell(wiring.socket, {
    type: 'tool.ran',
    name: call.name,
    input: JSON.stringify(call.args),
    result: JSON.stringify(result),
  });
}

/**
 * Record what one live turn used against its session.
 *
 * @param conversation - The session, for its model and its row.
 * @param db - The database the ledger is in.
 * @param counts - The tokens Gemini reported for the turn.
 */
function recordUsage(conversation: Conversation, db: Database, counts: TokenCounts): void {
  const { model, keeper } = conversation;
  recordTurn(db, { at: Date.now(), model, sessionId: keeper.sessionId }, counts);
}

/**
 * Pass one thing the model did down to the browser, and keep what is worth keeping.
 *
 * @param conversation - The session it came from.
 * @param wiring - The memory and the browser's socket.
 * @param event - What the model did.
 */
function relayDown(
  conversation: Conversation,
  wiring: { db: Database; socket: WSContext },
  event: BrainEvent,
): void {
  const { socket } = wiring;
  switch (event.type) {
    case 'audio':
      socket.send(event.pcm);
      return;
    case 'tool_call':
      tell(socket, { type: 'tool.call', callId: event.callId, input: event.input });
      return;
    case 'server_tool_call':
      runTool(conversation, wiring, event);
      return;
    case 'transcript':
      conversation.keeper.heard(event.role, event.text);
      tell(socket, { type: 'transcript', role: event.role, text: event.text });
      return;
    case 'interrupted':
      tell(socket, { type: 'speech.interrupted' });
      return;
    case 'usage':
      recordUsage(conversation, wiring.db, event.counts);
      return;
    case 'closed':
      endConversation(conversation, wiring.db, event.reason);
      tell(socket, { type: 'session.state', state: 'failed', detail: event.reason });
  }
}

/**
 * Pass one message from the browser up to the model.
 *
 * @param conversation - The live session and its keeper.
 * @param data - What the browser sent.
 */
function relayUp(conversation: Conversation, data: unknown): void {
  if (data instanceof ArrayBuffer) {
    conversation.brain.sendAudio(data);
    return;
  }
  const parsed = UpMessage.safeParse(JSON.parse(String(data)));
  if (parsed.success) relayMessage(conversation, parsed.data);
}

/**
 * Pass one parsed message from the browser up to the model.
 *
 * @param conversation - The live session and its keeper.
 * @param message - What the browser sent, already validated.
 */
function relayMessage({ brain, keeper }: Conversation, message: UpMessage): void {
  switch (message.type) {
    case 'senses.note':
      brain.sendNote(message.text);
      return;
    case 'senses.interrupt':
      brain.sendInterrupt(message.text);
      return;
    case 'senses.activity':
      brain.sendActivity(message.state);
      return;
    case 'vision.frame':
      brain.sendFrame(message.jpeg);
      return;
    case 'events.batch':
      keeper.noticed(message.events);
      return;
    case 'tool.result': {
      // Section 7.3: the browser answers at once, so a slow hand never stalls speech.
      const { ok, answer } = message;
      brain.sendToolResult(message.callId, answer === undefined ? { ok } : { ok, answer });
      return;
    }
    default:
      return;
  }
}

/**
 * Open a conversation for a browser that just connected, telling it how that goes.
 *
 * @param deps - The account and the memory.
 * @param socket - The browser's socket.
 * @param asked - What the connect asked for, unvalidated.
 * @returns The conversation, or null when it would not open. The browser has
 * been told why.
 */
async function answerConnect(
  deps: LiveDeps,
  socket: WSContext,
  asked: Asked,
): Promise<Conversation | null> {
  tell(socket, { type: 'session.state', state: 'connecting' });
  try {
    const conversation = await openConversation(deps, socket, asked);
    tell(socket, { type: 'session.state', state: 'live' });
    return conversation;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    tell(socket, { type: 'session.state', state: 'failed', detail });
    return null;
  }
}

/**
 * Close a conversation's record: the session in the memory, and its call in
 * the usage ledger. Safe to call more than once.
 *
 * @param conversation - The session that ended.
 * @param db - The database.
 * @param reason - Why it ended.
 */
function endConversation(conversation: Conversation, db: Database, reason: string): void {
  conversation.keeper.end(reason);
  endCall(db, conversation.usageId, Date.now());
}

/**
 * End a conversation from the browser's side.
 *
 * @param conversation - The session to end, or null when none was opened.
 * @param db - The database.
 */
function hangUp(conversation: Conversation | null, db: Database): void {
  if (!conversation) return;
  endConversation(conversation, db, 'closed');
  conversation.brain.close();
}

/**
 * Build the live relay.
 *
 * @param deps - The account and the memory, handed to every session that opens.
 * @returns A Hono app exposing `GET /live` as a websocket.
 */
export function live(deps: LiveDeps): Hono {
  return new Hono().get(
    '/live',
    upgradeWebSocket((context) => {
      let conversation: Conversation | null = null;
      let gone = false;
      const asked: Asked = {
        voice: context.req.query('voice'),
        language: context.req.query('language'),
        name: context.req.query('name'),
        listening: context.req.query('listening'),
      };

      return {
        async onOpen(_event, socket) {
          conversation = await answerConnect(deps, socket, asked);
          // The browser can leave while the session is still opening.
          if (gone) hangUp(conversation, deps.db);
        },
        onMessage(event) {
          if (conversation) relayUp(conversation, event.data);
        },
        onClose() {
          gone = true;
          hangUp(conversation, deps.db);
          conversation = null;
        },
      };
    }),
  );
}
