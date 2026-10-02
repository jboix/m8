/** The Gemini account, the model listing and the text client, against a fake Gemini. */
import { describe, expect, test } from 'bun:test';
import { openDatabase } from '../memory/db.ts';
import { fakeAccount, fakeGemini, GOOD_KEY } from './fake.ts';
import { sortModels } from './models.ts';
import { createCompleter } from './text.ts';

/** One day, in milliseconds. */
const DAY = 86_400_000;

describe('sortModels', () => {
  test('keeps conversation and text models apart, newest first', () => {
    const listed = [
      { name: 'models/gemini-2.5-flash', supportedGenerationMethods: ['generateContent'] },
      { name: 'models/gemini-3.8-flash-tts', supportedGenerationMethods: ['generateContent'] },
      { name: 'models/gemini-3.5-flash-lite', supportedGenerationMethods: ['generateContent'] },
      { name: 'models/gemini-3.5-flash', supportedGenerationMethods: ['generateContent'] },
      { name: 'models/gemini-3.10-flash', supportedGenerationMethods: ['generateContent'] },
      { name: 'models/gemini-flash-latest', supportedGenerationMethods: ['generateContent'] },
      { name: 'models/gemma-4-31b-it', supportedGenerationMethods: ['generateContent'] },
      {
        name: 'models/gemini-3.8-live-extended-thinking',
        supportedGenerationMethods: ['bidiGenerateContent'],
      },
      { name: 'models/gemini-3.8-live', supportedGenerationMethods: ['bidiGenerateContent'] },
      {
        name: 'models/gemini-3.9-flash-live-preview',
        supportedGenerationMethods: ['bidiGenerateContent'],
      },
      {
        name: 'models/gemini-3.9-transcribe-live',
        supportedGenerationMethods: ['bidiGenerateContent'],
      },
    ];

    const sorted = sortModels(listed);

    expect(sorted.text.map((model) => model.id)).toEqual([
      'gemini-3.10-flash',
      'gemini-3.5-flash',
      'gemini-3.5-flash-lite',
      'gemini-2.5-flash',
      'gemini-flash-latest',
    ]);
    expect(sorted.live.map((model) => model.id)).toEqual([
      'gemini-3.9-flash-live-preview',
      'gemini-3.8-live',
      'gemini-3.8-live-extended-thinking',
    ]);
  });
});

describe('the account', () => {
  test('has no key and no models until one is set', async () => {
    const account = await fakeAccount(openDatabase(':memory:'));

    expect(await account.view()).toEqual({
      key: null,
      live: null,
      memory: null,
      callsPerDay: 0,
      context: 'medium',
    });
    await expect(account.forCall('live', { purpose: 'conversation' })).rejects.toThrow(
      'no Gemini key',
    );
  });

  test('refuses a key Gemini refuses, with what Gemini said', async () => {
    const account = await fakeAccount(openDatabase(':memory:'));

    await expect(account.setKey('bad-key-1234')).rejects.toThrow(
      'API key not valid. Please pass a valid API key.',
    );
    expect((await account.view()).key).toBeNull();
  });

  test('stores a good key masked, and picks the newest model for each job', async () => {
    const db = openDatabase(':memory:');
    const account = await fakeAccount(db);

    const view = await account.setKey(GOOD_KEY);

    expect(view).toEqual({
      key: '••••••••abcd',
      live: 'gemini-3.8-live',
      memory: 'gemini-3.8-flash',
      callsPerDay: 0,
      context: 'medium',
    });
    expect(JSON.stringify(db.query('SELECT value FROM settings').all())).not.toContain(GOOD_KEY);
    expect(await account.forCall('live', { purpose: 'conversation' })).toMatchObject({
      apiKey: GOOD_KEY,
      model: 'gemini-3.8-live',
    });
  });

  test('changes a model only to one the key can use', async () => {
    const account = await fakeAccount(openDatabase(':memory:'));
    await account.setKey(GOOD_KEY);

    await expect(account.choose({ live: 'gemini-3.8-flash' })).rejects.toThrow('not a live model');
    expect((await account.choose({ live: 'gemini-3.1-flash-live-preview' })).live).toBe(
      'gemini-3.1-flash-live-preview',
    );
  });

  test('keeps the chosen models when the key is replaced and they are still there', async () => {
    const account = await fakeAccount(openDatabase(':memory:'));
    await account.setKey(GOOD_KEY);
    await account.choose({ memory: 'gemini-3.5-flash' });

    expect((await account.setKey(GOOD_KEY)).memory).toBe('gemini-3.5-flash');
  });

  test('refuses calls past the daily limit, and allows them again a day later', async () => {
    let now = 0;
    const account = await fakeAccount(openDatabase(':memory:'), fakeGemini().fetcher, () => now);
    await account.setKey(GOOD_KEY);
    await account.choose({ callsPerDay: 2 });

    await account.forCall('live', { purpose: 'conversation' });
    await account.forCall('memory', { purpose: 'summary' });
    await expect(account.forCall('memory', { purpose: 'summary' })).rejects.toThrow(
      '2 calls to Gemini in the last 24 hours',
    );

    now = DAY;
    expect((await account.forCall('memory', { purpose: 'summary' })).model).toBe(
      'gemini-3.8-flash',
    );
  });

  test('keeps counting across a restart, because the count is in the database', async () => {
    const now = 0;
    const db = openDatabase(':memory:');
    const before = await fakeAccount(db, fakeGemini().fetcher, () => now);
    await before.setKey(GOOD_KEY);
    await before.choose({ callsPerDay: 1 });
    await before.forCall('memory', { purpose: 'summary' });

    const after = await fakeAccount(db, fakeGemini().fetcher, () => now);
    await after.setKey(GOOD_KEY);

    await expect(after.forCall('memory', { purpose: 'summary' })).rejects.toThrow('the limit');
  });

  test('hands out the context size with the key, and keeps a stored choice from before it', async () => {
    const db = openDatabase(':memory:');
    const account = await fakeAccount(db);
    await account.setKey(GOOD_KEY);
    db.run(
      "UPDATE settings SET value = json_remove(value, '$.context') WHERE key = 'gemini.choice'",
    );

    expect((await account.forCall('live', { purpose: 'conversation' })).context).toBe('medium');
    await account.choose({ context: 'short' });
    expect((await account.forCall('live', { purpose: 'conversation' })).context).toBe('short');
  });

  test('has no limit at 0', async () => {
    const account = await fakeAccount(openDatabase(':memory:'));
    await account.setKey(GOOD_KEY);

    for (let call = 0; call < 50; call++) await account.forCall('memory', { purpose: 'summary' });
    expect((await account.forCall('memory', { purpose: 'summary' })).apiKey).toBe(GOOD_KEY);
  });
});

describe('createCompleter', () => {
  test('asks the memory model with the key in a header, and drops its thoughts', async () => {
    const gemini = fakeGemini('{"ok":true}');
    const db = openDatabase(':memory:');
    const account = await fakeAccount(db, gemini.fetcher);
    await account.setKey(GOOD_KEY);

    const reply = await createCompleter(
      account,
      db,
      gemini.fetcher,
    )({ prompt: 'hi', json: true, purpose: 'ping' });
    const request = gemini.requests.at(-1);

    expect(reply).toBe('{"ok":true}');
    expect(request?.url).toEndWith('/models/gemini-3.8-flash:generateContent');
    expect(request?.url).not.toContain(GOOD_KEY);
    expect(request?.key).toBe(GOOD_KEY);
    expect(request?.body).toMatchObject({
      contents: [{ role: 'user', parts: [{ text: 'hi' }] }],
      generationConfig: { responseMimeType: 'application/json' },
    });
    expect(db.query('SELECT purpose, input_text, output_text, thinking FROM usage').all()).toEqual([
      { purpose: 'ping', input_text: 12, output_text: 4, thinking: 30 },
    ]);
  });
});
