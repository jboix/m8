/** One session, from the first word to the episode. */
import { describe, expect, test } from 'bun:test';
import { gatherMemory, renderMemory } from './bootstrap.ts';
import { openDatabase } from './db.ts';
import { recentEpisodes } from './episodes.ts';
import { keepSession } from './keeper.ts';
import { lastSession, turnsOf } from './sessions.ts';

/** Who every session here is with. */
const ADA = { person: 'Ada', language: 'en', persona: 'You are m8.' };

describe('keepSession', () => {
  test('joins fragments into turns and summarizes once it ends', async () => {
    const db = openDatabase(':memory:');
    const replies = [JSON.stringify({ summary: 'They said hello twice.' }), 'I like hellos.'];
    const complete = () => Promise.resolve(replies.shift() ?? '');
    const keeper = keepSession({ db, complete, now: () => 5 }, ADA);

    keeper.heard('user', 'hel');
    keeper.heard('user', 'lo');
    keeper.heard('model', 'hey Ada');
    keeper.heard('user', 'hello again');
    keeper.heard('model', 'hey again');
    keeper.end('closed');
    keeper.end('closed');
    await Bun.sleep(0);

    expect(turnsOf(db, 1).map((turn) => turn.text)).toEqual([
      'hello',
      'hey Ada',
      'hello again',
      'hey again',
    ]);
    expect(recentEpisodes(db, 5).map((episode) => episode.summary)).toEqual([
      'They said hello twice.',
    ]);
  });

  test('opens with what the memory already holds', () => {
    const db = openDatabase(':memory:');
    const complete = () => Promise.resolve('');
    keepSession({ db, complete, now: () => 5 }, ADA).ranTool({ name: 'recall', args: {} }, {});

    expect(keepSession({ db, complete, now: () => 5 }, ADA).memory).toContain('What you remember');
  });

  test('keeps the last mood reported as the mood the session ended in', () => {
    const db = openDatabase(':memory:');
    const keeper = keepSession({ db, complete: () => Promise.resolve(''), now: () => 5 }, ADA);
    const mood = { arousal: 0.2, curiosity: 0.4, boredom: 0.9, valence: 0.3 };

    keeper.noticed([{ type: 'mood', ts: 1, mood: { ...mood, boredom: 0.1 } }]);
    keeper.noticed([{ type: 'mood', ts: 2, mood }]);
    keeper.end('closed');

    expect(lastSession(db)?.mood).toEqual(mood);
    expect(renderMemory(gatherMemory(db, 6), 'Ada', 6)).toContain(
      'When it ended you were a bit put out and bored.',
    );
  });
});
