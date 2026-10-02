/** The stored settings. */
import { describe, expect, test } from 'bun:test';
import { DEFAULT_SETTINGS } from '@m8/shared';
import { loadSettings, saveSettings } from './store.ts';

/**
 * A storage that lives for one test.
 *
 * @returns Something with the two methods the store uses.
 */
function memoryStorage(): Storage {
  const kept = new Map<string, string>();
  return {
    getItem: (key: string) => kept.get(key) ?? null,
    setItem: (key: string, value: string) => kept.set(key, value),
  } as unknown as Storage;
}

describe('the settings store', () => {
  test('gives the defaults when nothing is stored', () => {
    expect(loadSettings(memoryStorage())).toEqual(DEFAULT_SETTINGS);
  });

  test('gives back what was saved', () => {
    const storage = memoryStorage();
    const quiet = { ...DEFAULT_SETTINGS, eyeSounds: false, eyeSoundVolume: 0.3 };
    saveSettings(storage, quiet);

    expect(loadSettings(storage)).toEqual(quiet);
  });

  test('keeps settings stored before the developer switch existed, with it off', () => {
    const storage = memoryStorage();
    const { developer: _added, ...older } = { ...DEFAULT_SETTINGS, eyeSounds: false };
    storage.setItem('m8.settings.v1', JSON.stringify(older));

    expect(loadSettings(storage)).toEqual({ ...older, developer: false });
  });

  test('falls back to the defaults when what is stored no longer validates', () => {
    const storage = memoryStorage();
    storage.setItem('m8.settings.v1', JSON.stringify({ eyeSounds: 'loud' }));

    expect(loadSettings(storage)).toEqual(DEFAULT_SETTINGS);
  });
});
