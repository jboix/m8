/** The server-executed tools, against a memory that dies with the test. */
import { describe, expect, test } from 'bun:test';
import { openDatabase } from '../memory/db.ts';
import { isServerTool, runServerTool } from './index.ts';

describe('isServerTool', () => {
  test('knows its own tools from the browser’s', () => {
    expect(isServerTool('remember')).toBe(true);
    expect(isServerTool('recall')).toBe(true);
    expect(isServerTool('look_at')).toBe(false);
  });
});

describe('runServerTool', () => {
  test('remembers, then recalls, and says when it was learned', () => {
    const db = openDatabase(':memory:');
    const kept = runServerTool(
      db,
      {
        name: 'remember',
        args: { text: 'Ada hates coriander', kind: 'preference', importance: 3 },
      },
      0,
    );
    const found = runServerTool(db, { name: 'recall', args: { query: 'coriander' } }, 86_400_000);

    expect(kept).toEqual({ ok: true, already_known: false });
    expect(found).toEqual({ memories: [{ text: 'Ada hates coriander', learned: 'yesterday' }] });
  });

  test('answers bad arguments with an error, never silence', () => {
    const db = openDatabase(':memory:');

    expect(runServerTool(db, { name: 'remember', args: { text: '' } }, 0)).toHaveProperty('error');
  });
});
