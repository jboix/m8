import { describe, expect, test } from 'bun:test';
import { LanguageCode } from '@m8/shared';
import { clearSetup, loadSetup, saveSetup } from './store.ts';
import { greetingLine, preferredLanguage, STRINGS } from './strings.ts';

/**
 * A `Storage` backed by a map.
 *
 * @returns Enough of the interface for the store.
 */
function memoryStorage(): Storage {
  const held = new Map<string, string>();
  return {
    getItem: (key: string) => held.get(key) ?? null,
    setItem: (key: string, value: string) => void held.set(key, value),
    removeItem: (key: string) => void held.delete(key),
  } as Storage;
}

describe('the setup store', () => {
  test('gives back what was saved, and nothing once cleared', () => {
    const storage = memoryStorage();
    expect(loadSetup(storage)).toBeNull();
    saveSetup(storage, { language: 'es', name: 'Josep' });
    expect(loadSetup(storage)).toEqual({ language: 'es', name: 'Josep' });
    clearSetup(storage);
    expect(loadSetup(storage)).toBeNull();
  });

  test('treats anything that does not validate as no setup', () => {
    const storage = memoryStorage();
    storage.setItem('m8.setup.v1', '{"language":"de","name":"x"}');
    expect(loadSetup(storage)).toBeNull();
    storage.setItem('m8.setup.v1', 'not json');
    expect(loadSetup(storage)).toBeNull();
  });
});

describe('the strings', () => {
  test('every language greets by name', () => {
    for (const language of LanguageCode.options) {
      expect(STRINGS[language].greeting).toContain('{name}');
      expect(greetingLine(language, 'Ada')).toMatch(/^\[script\] ".*Ada.*"$/);
    }
  });

  test('the screen opens in the first offered browser locale', () => {
    expect(preferredLanguage(['de-CH', 'es-ES', 'en'])).toBe('es');
    expect(preferredLanguage(['de'])).toBe('en');
  });
});
