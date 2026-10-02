/**
 * Keeps one live session in memory: what it opens with, what was said in it,
 * and what it comes to once it is over. Section 9 of docs/architecture.md.
 *
 * The relay owns the socket and this owns the rows, so the relay never writes
 * SQL and the memory never sees a websocket.
 */
import type { Database } from 'bun:sqlite';
import type { SenseEvent } from '@m8/shared';
import type { TextRequest } from '../gemini/text.ts';
import { gatherMemory, renderMemory } from './bootstrap.ts';
import {
  endSession,
  logEvent,
  logTurn,
  saveMood,
  startSession,
  type TurnRole,
  turnsOf,
} from './sessions.ts';
import { type RunningSituation, startSituation } from './situation.ts';
import { summarizeSession } from './summarizer.ts';
import { createTurnCollector } from './turns.ts';

/** What keeping a session needs from the world. */
export interface KeeperDeps {
  /** The memory. */
  db: Database;
  /**
   * Ask a text model. Used once the session is over, never during it.
   * @param request - The prompt.
   * @returns The reply.
   */
  complete: (request: TextRequest) => Promise<string>;
  /**
   * The clock.
   * @returns Milliseconds since the epoch.
   */
  now: () => number;
}

/** Who the session is with. */
export interface Who {
  /** What the person is called in transcripts and summaries. */
  person: string;
  /** The language code of the session. */
  language: string;
  /** The persona, slots filled. */
  persona: string;
}

/** One session's place in the memory. */
export interface SessionKeeper {
  /** The session's row, so what it spends can be recorded against it. */
  sessionId: number;
  /** What he remembers, rendered for the bootstrap packet. */
  memory: string;
  /**
   * Store a fragment of transcript.
   * @param role - Who is speaking.
   * @param text - The next few words.
   */
  heard(role: TurnRole, text: string): void;
  /**
   * Log a tool the server carried out.
   * @param call - The tool's name and arguments.
   * @param result - What the model was told.
   */
  ranTool(call: { name: string; args: unknown }, result: unknown): void;
  /**
   * Log what the local senses picked up. A mood report is kept as the session's
   * mood and not as a row of its own.
   * @param events - A batch from the browser.
   */
  noticed(events: SenseEvent[]): void;
  /**
   * Start writing him notes about the conversation so far, now that there is a
   * live session to put them into. They stop when the session ends.
   * @param send - Puts a line into the session without asking for a reply.
   */
  attend(send: (text: string) => void): void;
  /**
   * Close the session and, in the background, turn it into an episode. Safe to
   * call more than once: only the first call counts.
   * @param reason - Why it ended.
   */
  end(reason: string): void;
}

/**
 * Log a batch from the browser. A mood report becomes the session's mood, and
 * everything else a row of its own.
 *
 * @param db - The memory.
 * @param sessionId - The session it happened in.
 * @param events - The batch.
 */
function logSenses(db: Database, sessionId: number, events: SenseEvent[]): void {
  for (const event of events) {
    if (event.type === 'mood') saveMood(db, sessionId, event.mood);
    else logEvent(db, sessionId, event.ts, event.type, event);
  }
}

/**
 * Mark a session over and, in the background, turn it into an episode.
 *
 * @param deps - The memory, the model and the clock.
 * @param who - Who the session was with.
 * @param sessionId - The session.
 * @param reason - Why it ended.
 */
function closeAndSummarize(deps: KeeperDeps, who: Who, sessionId: number, reason: string): void {
  endSession(deps.db, sessionId, reason, deps.now());
  summarizeSession({ ...deps, ...who }, sessionId).catch((error: unknown) => {
    console.warn(`Session ${sessionId} was not summarized: ${String(error)}`);
  });
}

/**
 * Start writing the `[so far]` notes for a session.
 *
 * @param deps - The memory, the model and the clock.
 * @param who - Who the session is with.
 * @param sessionId - The session.
 * @param send - Puts a note into the live session without asking for a reply.
 * @returns The running notes, to be told about speech and stopped at the end.
 */
function startNotes(
  deps: KeeperDeps,
  who: Who,
  sessionId: number,
  send: (text: string) => void,
): RunningSituation {
  const turns = () => turnsOf(deps.db, sessionId);
  return startSituation({ ...deps, sessionId, turns, send, person: who.person }, deps.now);
}

/**
 * Start keeping a session.
 *
 * @param deps - The memory, the model and the clock.
 * @param who - Who the session is with.
 * @returns The keeper. The session row exists from this moment.
 */
export function keepSession(deps: KeeperDeps, who: Who): SessionKeeper {
  const { db, now } = deps;
  const memory = renderMemory(gatherMemory(db, now()), who.person, now());
  const sessionId = startSession(db, who, now());
  const turns = createTurnCollector((turn) => {
    logTurn(db, sessionId, turn);
  });
  let ended = false;
  let situation: RunningSituation | null = null;

  return {
    sessionId,
    memory,
    heard: (role, text) => {
      turns.add(role, text, now());
      situation?.heard(now());
    },
    attend: (send) => {
      situation = startNotes(deps, who, sessionId, send);
    },
    ranTool: (call, result) => {
      logEvent(db, sessionId, now(), `tool.${call.name}`, { args: call.args, result });
    },
    noticed: (events) => {
      logSenses(db, sessionId, events);
    },
    end: (reason) => {
      if (ended) return;
      ended = true;
      situation?.stop();
      turns.flush();
      closeAndSummarize(deps, who, sessionId, reason);
    },
  };
}
