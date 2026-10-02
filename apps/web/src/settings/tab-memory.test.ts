/** The settings sheet remembers its open tab, moves between tabs with the keys, and offers the rig. */
import { describe, expect, test } from 'bun:test';
import { DEFAULT_SETTINGS } from '@m8/shared';
import { offersRig } from './developer.ts';
import { loadTab, saveTab, tabForKey } from './tab-memory.ts';

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

/**
 * A storage that refuses everything, as a private window can.
 *
 * @returns Something whose two methods throw.
 */
function refusingStorage(): Storage {
  const refuse = () => {
    throw new Error('refused');
  };
  return { getItem: refuse, setItem: refuse } as unknown as Storage;
}

describe('the open tab', () => {
  test('is the first tab when nothing is stored', () => {
    expect(loadTab(memoryStorage())).toBe('general');
  });

  test('comes back as it was saved', () => {
    const storage = memoryStorage();
    saveTab(storage, 'gemini');
    expect(loadTab(storage)).toBe('gemini');
  });

  test('is the first tab when the stored value is not a tab', () => {
    const storage = memoryStorage();
    storage.setItem('m8.settings.tab', 'faces');
    expect(loadTab(storage)).toBe('general');
  });

  test('is the first tab, without an error, when storage is refused', () => {
    saveTab(refusingStorage(), 'usage');
    expect(loadTab(refusingStorage())).toBe('general');
  });
});

describe('the keys on the tab strip', () => {
  test('the arrows move one tab and wrap at the ends', () => {
    expect(tabForKey('general', 'ArrowRight')).toBe('people');
    expect(tabForKey('usage', 'ArrowRight')).toBe('general');
    expect(tabForKey('general', 'ArrowLeft')).toBe('usage');
  });

  test('Home and End go to the first and the last tab', () => {
    expect(tabForKey('memory', 'Home')).toBe('general');
    expect(tabForKey('memory', 'End')).toBe('usage');
  });

  test('any other key does nothing', () => {
    expect(tabForKey('memory', 'Enter')).toBeNull();
  });
});

describe('the developer options', () => {
  test('are off by default in a production build', () => {
    expect(offersRig(DEFAULT_SETTINGS, false)).toBe(false);
  });

  test('are on when the switch is on', () => {
    expect(offersRig({ ...DEFAULT_SETTINGS, developer: true }, false)).toBe(true);
  });

  test('are always on in a development build', () => {
    expect(offersRig(DEFAULT_SETTINGS, true)).toBe(true);
  });
});
