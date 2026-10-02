/** What a session is told it remembers. */
import { describe, expect, test } from 'bun:test';
import { FACE_EMBEDDING_SIZE } from '@m8/shared';
import { gatherMemory, renderMemory } from './bootstrap.ts';
import { openDatabase } from './db.ts';
import { addEpisode, addSelfModel } from './episodes.ts';
import { learnFace } from './faces.ts';
import { addFact } from './facts.ts';
import { endSession, logTurn, startSession } from './sessions.ts';
import { ago, clock, lasting } from './when.ts';

/** Noon on a fixed day, so that day arithmetic never straddles midnight. */
const NOON = new Date(2026, 8, 21, 12, 0).getTime();

/** One hour. */
const HOUR = 3_600_000;

describe('ago', () => {
  test('counts minutes and hours within a day', () => {
    expect(ago(NOON - 30_000, NOON)).toBe('a moment ago');
    expect(ago(NOON - 5 * 60_000, NOON)).toBe('5 minutes ago');
    expect(ago(NOON - 2 * HOUR, NOON)).toBe('2 hours ago');
  });

  test('counts calendar days after that, not elapsed hours', () => {
    expect(ago(NOON - 13 * HOUR, NOON)).toBe('yesterday');
    expect(ago(NOON - 72 * HOUR, NOON)).toBe('3 days ago');
  });
});

describe('clock and lasting', () => {
  test('say the date, the hour and the part of the day', () => {
    expect(clock(NOON)).toBe('Monday, 21 September 2026 at 12:00, in the afternoon');
    expect(clock(NOON - 10 * HOUR)).toContain('at 02:00, at night');
  });

  test('say how long something went on', () => {
    expect(lasting(20_000)).toBe('under a minute');
    expect(lasting(3 * 60_000)).toBe('3 minutes');
    expect(lasting(HOUR)).toBe('1 hour');
  });
});

describe('renderMemory', () => {
  test('carries only the date when nothing is remembered yet', () => {
    const db = openDatabase(':memory:');
    const text = renderMemory(gatherMemory(db, NOON), 'Ada', NOON);

    expect(text).toContain('21 September 2026');
    expect(text).toContain('the first time you have ever been switched on');
    expect(text).not.toContain('###');
  });

  test('carries the self-model, the episodes, the facts and a loose end', () => {
    const db = openDatabase(':memory:');
    const past = startSession(db, { person: 'Ada', language: 'en' }, NOON - 30 * HOUR);
    endSession(db, past, 'closed', NOON - 29 * HOUR);
    addEpisode(db, past, 'Ada showed me a cello.', NOON - 29 * HOUR);
    addSelfModel(db, 'I think cellos are big violins.', null, NOON - 29 * HOUR);
    addFact(
      db,
      { kind: 'person', text: 'Ada plays the cello', importance: 4, source: 'tool' },
      NOON - 29 * HOUR,
    );
    const recent = startSession(db, { person: 'Ada', language: 'en' }, NOON - 120_000);
    logTurn(db, recent, { role: 'user', text: 'back in a second', ts: NOON - 90_000 });
    endSession(db, recent, 'closed', NOON - 60_000);

    const text = renderMemory(gatherMemory(db, NOON), 'Ada', NOON);

    expect(text).toContain('I think cellos are big violins.');
    expect(text).toContain('- yesterday: Ada showed me a cello.');
    expect(text).toContain('- Ada plays the cello');
    expect(text).toContain('Ada: back in a second');
    expect(text).toContain('You were last switched on a moment ago, for 1 minute.');
  });

  test('names the people he knows by sight', () => {
    const db = openDatabase(':memory:');
    const embedding = new Array<number>(FACE_EMBEDDING_SIZE).fill(0);
    learnFace(db, 'Ada', embedding, NOON - HOUR);
    learnFace(db, 'Bo', embedding, NOON - HOUR);

    const text = renderMemory(gatherMemory(db, NOON), 'Ada', NOON);

    expect(text).toContain('People you know by sight');
    expect(text).toContain('Ada and Bo.');
  });
});
