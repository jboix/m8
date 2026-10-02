/** The rig's dock and size: the limits, the drag, and what the browser keeps. */
import { describe, expect, test } from 'bun:test';
import {
  clampSize,
  DEFAULT_RIG_LAYOUT,
  loadRigLayout,
  saveRigLayout,
  sizeAt,
} from './rig-layout.ts';

/** A desktop window. */
const WINDOW = { width: 1200, height: 800 };

/**
 * A storage that keeps one value per key, or refuses everything.
 *
 * @param refuses - True makes every call throw, as a private window can.
 * @returns The storage.
 */
function storage(refuses = false): Storage {
  const kept = new Map<string, string>();
  const refuse = () => {
    throw new Error('refused');
  };
  return {
    getItem: (key: string) => (refuses ? refuse() : (kept.get(key) ?? null)),
    setItem: (key: string, value: string) => (refuses ? refuse() : kept.set(key, value)),
  } as unknown as Storage;
}

describe('clampSize', () => {
  test('keeps the rig big enough for its tabs, and the stage big enough for the eyes', () => {
    expect(clampSize('side', 100, WINDOW)).toBe(300);
    expect(clampSize('side', 1150, WINDOW)).toBe(960);
    expect(clampSize('bottom', 50, WINDOW)).toBe(160);
    expect(clampSize('bottom', 790, WINDOW)).toBe(660);
  });

  test('gives the rig its minimum when the window is too small for both', () => {
    expect(clampSize('side', 400, { width: 400, height: 800 })).toBe(300);
  });
});

describe('sizeAt', () => {
  test('measures from the pointer to the far edge', () => {
    expect(sizeAt('side', { x: 700, y: 10 }, WINDOW)).toBe(500);
    expect(sizeAt('bottom', { x: 10, y: 500 }, WINDOW)).toBe(300);
  });
});

describe('the stored layout', () => {
  test('comes back as it was kept', () => {
    const kept = storage();
    saveRigLayout(kept, { dock: 'bottom', side: 520, bottom: 300 });

    expect(loadRigLayout(kept)).toEqual({ dock: 'bottom', side: 520, bottom: 300 });
  });

  test('falls back to the default for nothing, nonsense, or a refusal', () => {
    const odd = storage();
    odd.setItem('m8.rig-layout.v1', '{"dock":"left","side":-4,"bottom":"tall"}');

    expect(loadRigLayout(storage())).toEqual(DEFAULT_RIG_LAYOUT);
    expect(loadRigLayout(odd)).toEqual({ dock: 'side', side: null, bottom: null });
    expect(loadRigLayout(storage(true))).toEqual(DEFAULT_RIG_LAYOUT);
    expect(() => saveRigLayout(storage(true), DEFAULT_RIG_LAYOUT)).not.toThrow();
  });
});
