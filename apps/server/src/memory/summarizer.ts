/**
 * Turns a finished session into memory: an episode, the facts worth keeping,
 * and a new version of how he describes himself. Section 9 of
 * docs/architecture.md.
 *
 * It runs after the session has closed, through the memory model, so
 * nothing here is ever waited on by a conversation.
 */

import type { Database } from 'bun:sqlite';
import { FactKind } from '@m8/shared';
import { z } from 'zod';
import type { TextRequest } from '../gemini/text.ts';
import { addEpisode, addSelfModel, latestSelfModel } from './episodes.ts';
import { addFact, supersedeFact, topFacts } from './facts.ts';
import { type Turn, turnsOf } from './sessions.ts';

/** How many turns a session needs before it is worth an episode. */
const MIN_TURNS = 4;

/** The most transcript handed to the model, in characters. The end is what is kept. */
const MAX_TRANSCRIPT_CHARS = 12_000;

/** How many known facts the model is shown, so it can replace one. */
const KNOWN_FACTS = 30;

/** What the model is asked to return for a session. */
const EpisodeDraft = z.object({
  summary: z.string().min(1),
  facts: z
    .array(
      z.object({
        text: z.string().min(1).max(280),
        kind: FactKind,
        importance: z.number().int().min(1).max(5),
        /** The id of a known fact this one replaces. */
        supersedes: z.number().int().nullable().optional(),
      }),
    )
    .default([]),
});

/** What the model is asked to return for a session. */
type EpisodeDraft = z.infer<typeof EpisodeDraft>;

/** What the summarizer needs from the world. */
export interface SummarizerDeps {
  /** The memory. */
  db: Database;
  /**
   * Ask a text model.
   * @param request - The prompt.
   * @returns The reply.
   */
  complete: (request: TextRequest) => Promise<string>;
  /** The persona, slots filled. The self-model is written within its limits. */
  persona: string;
  /** Who he was talking to. */
  person: string;
  /**
   * The clock.
   * @returns Milliseconds since the epoch.
   */
  now: () => number;
}

/** What summarizing a session produced. */
export interface Summarized {
  /** The episode stored. */
  episodeId: number;
  /** How many facts were new. */
  newFacts: number;
  /** The self-model version stored, or null when the model wrote nothing. */
  selfModelVersion: number | null;
}

/**
 * Whether a conversation is worth remembering as an episode.
 *
 * @param turns - What was said.
 * @returns True when there was some back and forth, and the person spoke.
 */
export function isWorthAnEpisode(turns: Turn[]): boolean {
  return turns.length >= MIN_TURNS && turns.some((turn) => turn.role === 'user');
}

/**
 * Read a JSON object out of a model's reply.
 *
 * @param reply - The reply, which may wrap its JSON in a code fence or a sentence.
 * @returns The parsed value, or null when there is no object in it.
 */
export function readJsonObject(reply: string): unknown {
  const start = reply.indexOf('{');
  const end = reply.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(reply.slice(start, end + 1));
  } catch {
    return null;
  }
}

/**
 * Write a date out in full.
 *
 * @param now - The moment.
 * @returns For example `Monday, 21 September 2026`, in the server's timezone.
 */
function today(now: number): string {
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'full' }).format(now);
}

/**
 * Write a conversation out as a script.
 *
 * @param turns - What was said.
 * @param person - The name the person's lines are given.
 * @returns One line per turn. Only the end is kept when it is very long.
 */
function toScript(turns: Turn[], person: string): string {
  return turns
    .map((turn) => `${turn.role === 'user' ? person : 'm8'}: ${turn.text}`)
    .join('\n')
    .slice(-MAX_TRANSCRIPT_CHARS);
}

/**
 * The prompt that turns a conversation into an episode and facts.
 *
 * @param script - The conversation.
 * @param known - What he already knows, one `id: text` per line.
 * @param person - Who he was talking to.
 * @param today - The date of the conversation, written out.
 * @returns The prompt.
 */
function episodePrompt(script: string, known: string, person: string, today: string): string {
  return `You are the memory of m8, a small character who is a pair of eyes on a screen. He has just finished talking with ${person}. Today is ${today}. Decide what he keeps.

Reply with one JSON object and nothing else:
{"summary": string, "facts": [{"text": string, "kind": "person" | "preference" | "event" | "self", "importance": 1-5, "supersedes": number | null}]}

- "summary": about 80 words, in English, in the third person, past tense. What happened, what was funny, what he was taught, how it ended. Concrete details over general ones.
- "facts": zero to five things worth knowing on another day. Each is one sentence that makes sense on its own, written in the language the conversation was in. Names, likes and dislikes, things he was taught, running jokes, plans somebody mentioned. Nothing he already knows, and no small talk. A fact is read on some later day, so write dates out in full: never "tomorrow" or "on Friday".
- "kind": "person" is about somebody, "preference" is a like or dislike, "event" is something that happened or will, "self" is something he found out about himself.
- "supersedes": the id of a known fact that this one corrects or updates, otherwise null.

What he already knows:
${known || '(nothing yet)'}

The conversation:
${script}`;
}

/**
 * The prompt that rewrites the self-model.
 *
 * @param persona - The frozen core, which the result may not contradict.
 * @param previous - The current self-model, or null for the first one.
 * @param summary - The episode that just happened.
 * @returns The prompt.
 */
function selfModelPrompt(persona: string, previous: string | null, summary: string): string {
  return `You write the diary page a small character called m8 keeps about himself. Below is who he is at his core, which never changes and which you must not contradict or repeat. Then what he last wrote about himself, then what just happened to him.

Rewrite the page. First person, his own voice, plain small words, under 250 words, English, no headings and no lists. Keep what still holds. Let what just happened change him a little: an opinion he has formed, a running joke, a wrong theory he is fond of, how he feels about the people he knows, what he is curious about next. Drop what has gone stale. Do not list events: that is what his memory is for. Reply with the page and nothing else.

His core:
${persona}

What he last wrote about himself:
${previous ?? '(nothing yet, this is his first page)'}

What just happened:
${summary}`;
}

/**
 * Store what the model decided to keep.
 *
 * @param db - The memory.
 * @param draft - The model's reply, already validated.
 * @param now - When.
 * @returns How many of the facts were new.
 */
function keepFacts(db: Database, draft: EpisodeDraft, now: number): number {
  return draft.facts.filter((fact) => {
    const kept = addFact(db, { ...fact, source: 'summarizer' }, now);
    if (fact.supersedes != null) supersedeFact(db, fact.supersedes, kept.id);
    return !kept.known;
  }).length;
}

/**
 * Turn one finished session into an episode, facts and a new self-model.
 *
 * @param deps - The memory, the model and the clock.
 * @param sessionId - The session that ended.
 * @returns What was stored, or null when the session was too short to be worth
 * it or the model's reply could not be read. Nothing is stored in that case.
 * @throws {Error} When the model cannot be reached.
 */
export async function summarizeSession(
  deps: SummarizerDeps,
  sessionId: number,
): Promise<Summarized | null> {
  const turns = turnsOf(deps.db, sessionId);
  if (!isWorthAnEpisode(turns)) return null;

  const known = topFacts(deps.db, KNOWN_FACTS)
    .map((fact) => `${fact.id}: ${fact.text}`)
    .join('\n');
  const reply = await deps.complete({
    prompt: episodePrompt(toScript(turns, deps.person), known, deps.person, today(deps.now())),
    purpose: 'summary',
    sessionId,
    maxTokens: 1024,
    json: true,
  });
  const draft = EpisodeDraft.safeParse(readJsonObject(reply));
  if (!draft.success) return null;

  const episodeId = addEpisode(deps.db, sessionId, draft.data.summary, deps.now());
  const newFacts = keepFacts(deps.db, draft.data, deps.now());
  const selfModelVersion = await rewriteSelfModel(deps, sessionId, episodeId, draft.data.summary);
  return { episodeId, newFacts, selfModelVersion };
}

/**
 * Write the next version of the self-model.
 *
 * @param deps - The memory, the model and the clock.
 * @param sessionId - The session the episode came from.
 * @param episodeId - The episode that prompts it.
 * @param summary - What that episode says.
 * @returns The version stored, or null when the model wrote nothing.
 * @throws {Error} When the model cannot be reached.
 */
async function rewriteSelfModel(
  deps: SummarizerDeps,
  sessionId: number,
  episodeId: number,
  summary: string,
): Promise<number | null> {
  const previous = latestSelfModel(deps.db)?.body ?? null;
  const page = await deps.complete({
    prompt: selfModelPrompt(deps.persona, previous, summary),
    purpose: 'self-model',
    sessionId,
    maxTokens: 700,
  });
  return page.trim() === '' ? null : addSelfModel(deps.db, page.trim(), episodeId, deps.now());
}
