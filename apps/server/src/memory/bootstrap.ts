/**
 * What he has in mind before anyone speaks. Section 9 of docs/architecture.md.
 *
 * The persona says who he is and never changes. This is the part that does:
 * who he has become, what happened lately, and what he knows. It is rendered
 * as text here so that every adapter gets the same words.
 */

import type { Database } from 'bun:sqlite';
import type { Episode, Fact } from '@m8/shared';
import { latestSelfModel, recentEpisodes } from './episodes.ts';
import { knownNames } from './faces.ts';
import { topFacts } from './facts.ts';
import { moodInWords } from './mood-words.ts';
import { lastSession, latestLooseEnd, type SessionSpan, type Turn } from './sessions.ts';
import { ago, clock, lasting } from './when.ts';

/** How long a mood is worth carrying over. After a night it is a new mood. */
const MOOD_LASTS_MS = 6 * 3_600_000;

/** How many episodes he is reminded of. */
const EPISODES = 3;

/** How many facts he is reminded of. The rest are a `recall` away. */
const FACTS = 12;

/** How many turns of a conversation that broke off are replayed to him. */
const LOOSE_END_TURNS = 8;

/**
 * How recently a conversation has to have broken off to be picked up again.
 *
 * @remarks
 * Presence closes the session when somebody leaves the room and opens another
 * when they return. Inside this window that is one conversation, not two.
 */
const LOOSE_END_MS = 10 * 60_000;

/** What the memory holds that is worth starting a session with. */
export interface Remembered {
  /** How he describes himself, or null before the first episode. */
  selfModel: string | null;
  /** The latest episodes, newest first. */
  episodes: Episode[];
  /** The facts most worth having in mind. */
  facts: Fact[];
  /** The tail of a conversation that broke off minutes ago, oldest first. */
  looseEnd: Turn[];
  /** The last time he was switched on, or null when this is the first. */
  lastSession: SessionSpan | null;
  /** The people he knows by sight. */
  knownBySight: string[];
}

/**
 * Read what a new session should start with.
 *
 * @param db - The memory.
 * @param now - When the session is opening.
 * @returns What he remembers. Reading it does not count as using a fact, so
 * what he is always told does not look more recalled than what he asks for.
 */
export function gatherMemory(db: Database, now: number): Remembered {
  return {
    selfModel: latestSelfModel(db)?.body ?? null,
    episodes: recentEpisodes(db, EPISODES),
    facts: topFacts(db, FACTS),
    looseEnd: latestLooseEnd(db, now - LOOSE_END_MS)?.turns.slice(-LOOSE_END_TURNS) ?? [],
    lastSession: lastSession(db),
    knownBySight: knownNames(db),
  };
}

/**
 * The line about the people he knows by sight.
 *
 * @param names - Their names.
 * @returns One line, or nothing when he knows nobody by sight.
 */
function knownBySight(names: string[]): string[] {
  if (names.length === 0) return [];
  return [
    `${listNames(names)}. You are told who is in front of you when it is one of them. Anybody else is somebody new until they say their name.`,
  ];
}

/**
 * Names as a sentence: "Ada", "Ada and Bo", "Ada, Bo and Cy".
 *
 * @param names - The names.
 * @returns The list.
 */
function listNames(names: string[]): string {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}

/**
 * Write one section, or nothing when it would be empty.
 *
 * @param title - The heading.
 * @param lines - The body. An empty body drops the whole section.
 * @returns The section, or an empty list.
 */
function section(title: string, lines: string[]): string[] {
  return lines.length === 0 ? [] : [`### ${title}`, ...lines, ''];
}

/**
 * Say when he was last switched on, which is what tells a person stepping out
 * of the room from a new day.
 *
 * @param last - The last finished session, or null.
 * @param now - When this one is opening.
 * @returns One sentence.
 */
function sinceLastTime(last: SessionSpan | null, now: number): string {
  if (!last) return 'This is the first time you have ever been switched on.';
  const length = lasting(last.endedAt - last.startedAt);
  const felt = last.mood && now - last.endedAt < MOOD_LASTS_MS ? moodInWords(last.mood) : null;
  const then = `You were last switched on ${ago(last.endedAt, now)}, for ${length}.`;
  return felt ? `${then} When it ended you were ${felt}.` : then;
}

/**
 * Render what he remembers as the text the session opens with.
 *
 * @param remembered - What the memory holds.
 * @param person - Who he is talking to, for the conversation that broke off.
 * @param now - When the session is opening.
 * @returns Text to follow the persona. It always carries the date, so he can
 * tell yesterday from last week even when he remembers nothing yet.
 */
export function renderMemory(remembered: Remembered, person: string, now: number): string {
  return [
    '## What you remember',
    '',
    `Right now it is ${clock(now)}. ${sinceLastTime(remembered.lastSession, now)}`,
    '',
    ...section('Who you have become', remembered.selfModel ? [remembered.selfModel] : []),
    ...section(
      'The last times you were switched on, newest first',
      remembered.episodes.map((episode) => `- ${ago(episode.createdAt, now)}: ${episode.summary}`),
    ),
    ...section(
      'Things you know',
      remembered.facts.map((fact) => `- ${fact.text}`),
    ),
    ...section('People you know by sight', knownBySight(remembered.knownBySight)),
    ...section('A few minutes ago you were in the middle of this', [
      ...remembered.looseEnd.map(
        (turn) => `${turn.role === 'user' ? person : 'You'}: ${turn.text}`,
      ),
    ]),
  ]
    .join('\n')
    .trim();
}
