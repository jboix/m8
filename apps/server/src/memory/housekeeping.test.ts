/** Pruning, decay and the sessions the summarizer missed. */
import { describe, expect, test } from 'bun:test';
import { openDatabase } from './db.ts';
import { addEpisode } from './episodes.ts';
import { addFact, supersedeFact, topFacts } from './facts.ts';
import {
  closeAbandonedSessions,
  dropUnusedFacts,
  missedSessions,
  pruneEvents,
  runHousekeeping,
} from './housekeeping.ts';
import { endSession, logTurn, startSession, turnsOf } from './sessions.ts';

/** One day. */
const DAY = 86_400_000;

/** One hour. */
const HOUR = 3_600_000;

/** Who every session here is with. */
const ADA = { person: 'Ada', language: 'en' };

describe('pruneEvents', () => {
  test('deletes the log of sessions that ended days ago, and no others', () => {
    const db = openDatabase(':memory:');
    const old = startSession(db, ADA, 0);
    logTurn(db, old, { role: 'user', text: 'long ago', ts: 1 });
    endSession(db, old, 'closed', 2);
    const recent = startSession(db, ADA, 9 * DAY);
    logTurn(db, recent, { role: 'user', text: 'just now', ts: 9 * DAY });
    endSession(db, recent, 'closed', 9 * DAY);

    expect(pruneEvents(db, 10 * DAY)).toBe(1);
    expect(turnsOf(db, old)).toEqual([]);
    expect(turnsOf(db, recent)).toHaveLength(1);
  });
});

describe('dropUnusedFacts', () => {
  test('drops old, minor facts nobody recalled, and keeps the rest', () => {
    const db = openDatabase(':memory:');
    const fact = (text: string, importance: number) =>
      addFact(db, { kind: 'event', text, importance, source: 'summarizer' }, 0);
    fact('minor and forgotten', 2);
    fact('important', 4);
    const replaced = fact('minor but out of date', 1);
    const replacement = fact('minor but it replaced something', 1);
    supersedeFact(db, replaced.id, replacement.id);

    expect(dropUnusedFacts(db, 10 * DAY)).toBe(0);
    expect(dropUnusedFacts(db, 40 * DAY)).toBe(1);
    expect(topFacts(db, 9).map((kept) => kept.text)).toEqual([
      'important',
      'minor but it replaced something',
    ]);
  });
});

describe('missedSessions', () => {
  test('finds recent sessions somebody spoke in that have no episode', () => {
    const db = openDatabase(':memory:');
    const summarized = startSession(db, ADA, 0);
    logTurn(db, summarized, { role: 'user', text: 'hello', ts: 1 });
    endSession(db, summarized, 'closed', 2);
    addEpisode(db, summarized, 'Ada said hello.', 3);
    const missed = startSession(db, ADA, 4);
    logTurn(db, missed, { role: 'user', text: 'hello again', ts: 5 });
    endSession(db, missed, 'closed', 6);
    endSession(db, startSession(db, ADA, 7), 'closed', 8);

    expect(missedSessions(db, 9)).toEqual([]);
    expect(missedSessions(db, HOUR)).toEqual([{ id: missed, ...ADA }]);
    expect(missedSessions(db, 4 * DAY)).toEqual([]);
  });

  test('includes a session a crash left open, once it has been closed', () => {
    const db = openDatabase(':memory:');
    const crashed = startSession(db, ADA, 0);
    logTurn(db, crashed, { role: 'user', text: 'hello', ts: 1 });

    expect(missedSessions(db, 2)).toEqual([]);
    expect(closeAbandonedSessions(db, 2)).toBe(1);
    expect(missedSessions(db, HOUR).map((session) => session.id)).toEqual([crashed]);
  });
});

describe('runHousekeeping', () => {
  test('summarizes what was missed before pruning anything', async () => {
    const db = openDatabase(':memory:');
    const missed = startSession(db, ADA, 0);
    for (const index of [0, 1, 2, 3]) {
      logTurn(db, missed, {
        role: index % 2 === 0 ? 'user' : 'model',
        text: `line ${index}`,
        ts: 1,
      });
    }
    endSession(db, missed, 'closed', 2);
    const replies = [JSON.stringify({ summary: 'Four lines were said.' }), 'I count lines now.'];

    const done = await runHousekeeping({
      db,
      complete: () => Promise.resolve(replies.shift() ?? ''),
      personaFor: () => Promise.resolve('You are m8.'),
      now: () => HOUR,
    });

    expect(done).toEqual({ sessionsSummarized: 1, eventsPruned: 0, factsDropped: 0 });
    expect(missedSessions(db, HOUR)).toEqual([]);
  });
});
