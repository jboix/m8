/**
 * A note to himself about the conversation so far, every several minutes.
 * Section 9 of docs/architecture.md.
 *
 * The live session's context slides: in a long conversation the beginning
 * falls off the end, and with it the game in progress and the promise he made.
 * The memory model writes a few lines about where things stand, and
 * they go back into the session as a `[so far]` line.
 *
 * Text put into a session ends whatever the model is saying, so a
 * note that is ready waits until nobody has spoken for a moment.
 */
import type { TextRequest } from '../gemini/text.ts';
import type { Turn } from './sessions.ts';

/**
 * The least time between two notes. The medium context keeps about five
 * minutes of conversation after it slides, so a note at least that often
 * carries what slides out.
 */
const EVERY_MS = 5 * 60_000;

/** How many turns have to have passed since the last note for another to be worth it. */
const MIN_NEW_TURNS = 12;

/** How long nobody must have spoken before a note is put into the session. */
const QUIET_MS = 4000;

/** The most conversation handed to the model, in characters. The end is what is kept. */
const MAX_SCRIPT_CHARS = 10_000;

/** The prefix the persona knows these notes by. */
export const SO_FAR_PREFIX = '[so far]';

/** What keeping the situation needs from the world. */
export interface SituationDeps {
  /**
   * Ask a text model.
   * @param request - The prompt.
   * @returns The reply.
   */
  complete: (request: TextRequest) => Promise<string>;
  /** The session, so the usage ledger can say what its notes cost. */
  sessionId: number;
  /**
   * Read the session's finished turns.
   * @returns Every turn so far, oldest first.
   */
  turns: () => Turn[];
  /**
   * Put a note into the live session without asking for a reply.
   * @param text - The `[so far]` line.
   */
  send: (text: string) => void;
  /** Who he is talking to. */
  person: string;
}

/** Keeps one session's situation note up to date. */
export interface Situation {
  /** Note that somebody, either side, just said something. */
  heard(now: number): void;
  /**
   * Let time pass. Call it about once a second.
   * @param now - The present.
   */
  tick(now: number): void;
}

/**
 * The prompt that sums a conversation up for the one having it.
 *
 * @param turns - The conversation so far.
 * @param person - Who he is talking to.
 * @returns The prompt.
 */
function prompt(turns: Turn[], person: string): string {
  const script = turns
    .map((turn) => `${turn.role === 'user' ? person : 'm8'}: ${turn.text}`)
    .join('\n')
    .slice(-MAX_SCRIPT_CHARS);
  return `m8 is a small character in the middle of a long conversation with ${person}, and he forgets how it started. Write him a note, to himself, in the second person ("you"), in English, at most 70 words, no lists. Say what has happened so far, and above all what is still open: a game in progress and its score, a promise, a running joke, a question nobody answered, something he was taught. Reply with the note and nothing else.

The conversation:
${script}`;
}

/** What one keeper remembers between ticks. */
interface Progress {
  /** When a note was last considered. */
  lastAt: number;
  /** How many turns the session had at the last note. */
  lastTurns: number;
  /** When anybody last spoke. */
  lastHeardAt: number;
  /** True while the model is writing a note. */
  writing: boolean;
  /** A note that is written and waiting for quiet, or null. */
  ready: string | null;
}

/**
 * Write the next note, to be delivered when it is quiet.
 *
 * @param deps - The model and the turns.
 * @param progress - Mutated in place.
 * @param now - The present.
 */
function write(deps: SituationDeps, progress: Progress, now: number): void {
  const turns = deps.turns();
  progress.lastAt = now;
  if (turns.length - progress.lastTurns < MIN_NEW_TURNS) return;
  progress.lastTurns = turns.length;
  progress.writing = true;
  deps
    .complete({
      prompt: prompt(turns, deps.person),
      maxTokens: 300,
      purpose: 'situation',
      sessionId: deps.sessionId,
    })
    .then((note) => {
      progress.ready = note.trim() === '' ? null : `${SO_FAR_PREFIX} ${note.trim()}`;
    })
    .catch(() => {
      progress.ready = null;
    })
    .finally(() => {
      progress.writing = false;
    });
}

/**
 * Start keeping a session's situation.
 *
 * @param deps - The model, the turns, and the way into the session.
 * @param startedAt - When the session opened. The first note is due a full interval later.
 * @returns The keeper. A note that cannot be written is skipped, and tried again an interval later.
 */
export function keepSituation(deps: SituationDeps, startedAt: number): Situation {
  const progress: Progress = {
    lastAt: startedAt,
    lastTurns: 0,
    lastHeardAt: startedAt,
    writing: false,
    ready: null,
  };

  return {
    heard(now) {
      progress.lastHeardAt = now;
    },
    tick(now) {
      if (progress.ready && now - progress.lastHeardAt >= QUIET_MS) {
        deps.send(progress.ready);
        progress.ready = null;
        return;
      }
      const idle = !progress.writing && !progress.ready;
      if (idle && now - progress.lastAt >= EVERY_MS) write(deps, progress, now);
    },
  };
}

/** How often a running situation is given the chance to write or deliver a note. */
const TICK_MS = 1000;

/** A situation that ticks by itself. */
export interface RunningSituation {
  /**
   * Note that somebody, either side, just said something.
   * @param now - When.
   */
  heard(now: number): void;
  /** Stop writing notes. */
  stop(): void;
}

/**
 * Keep a session's situation on the real clock.
 *
 * @param deps - The model, the turns, and the way into the session.
 * @param now - The clock.
 * @returns A handle to tell it about speech, and to stop it.
 */
export function startSituation(deps: SituationDeps, now: () => number): RunningSituation {
  const situation = keepSituation(deps, now());
  const timer = setInterval(() => {
    situation.tick(now());
  }, TICK_MS);
  return {
    heard: situation.heard,
    stop: () => {
      clearInterval(timer);
    },
  };
}
