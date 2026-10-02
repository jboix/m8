/** Sessions, their turns, and the ones left without an episode. */
import { describe, expect, test } from 'bun:test';
import { openDatabase } from './db.ts';
import { addEpisode } from './episodes.ts';
import { endSession, latestLooseEnd, logTurn, startSession, turnsOf } from './sessions.ts';

describe('sessions', () => {
  test('give their turns back in order', () => {
    const db = openDatabase(':memory:');
    const session = startSession(db, { person: 'Ada', language: 'en' }, 1);
    logTurn(db, session, { role: 'user', text: 'hello', ts: 2 });
    logTurn(db, session, { role: 'model', text: 'hey Ada', ts: 3 });

    expect(turnsOf(db, session).map((turn) => turn.text)).toEqual(['hello', 'hey Ada']);
  });

  test('are a loose end until they have an episode', () => {
    const db = openDatabase(':memory:');
    const session = startSession(db, { person: 'Ada', language: 'en' }, 1);
    logTurn(db, session, { role: 'user', text: 'hello', ts: 2 });
    expect(latestLooseEnd(db, 0)).toBeNull();

    endSession(db, session, 'closed', 10);
    expect(latestLooseEnd(db, 0)?.turns).toHaveLength(1);
    expect(latestLooseEnd(db, 11)).toBeNull();

    addEpisode(db, session, 'Ada said hello.', 12);
    expect(latestLooseEnd(db, 0)).toBeNull();
  });

  test('that nobody spoke in are not a loose end', () => {
    const db = openDatabase(':memory:');
    endSession(db, startSession(db, { person: 'Ada', language: 'en' }, 1), 'closed', 2);

    expect(latestLooseEnd(db, 0)).toBeNull();
  });
});
