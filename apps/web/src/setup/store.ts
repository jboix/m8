/** Keeps the finished setup in the browser, so the screen is shown once. */
import { type Setup, SetupChoice } from '@m8/shared';

/** The storage key. Versioned, so a change of shape can ignore what came before. */
const KEY = 'm8.setup.v1';

/**
 * Read the stored setup.
 *
 * @param storage - Where it was kept.
 * @returns The setup, or null when there is none or it no longer validates.
 * Null means the setup screen is shown again, which is the right repair.
 */
export function loadSetup(storage: Storage): Setup | null {
  try {
    const raw = storage.getItem(KEY);
    return raw === null ? null : (SetupChoice.safeParse(JSON.parse(raw)).data ?? null);
  } catch {
    // Unparseable JSON, or storage refused in a private window.
    return null;
  }
}

/**
 * Store the finished setup.
 *
 * @param storage - Where to keep it.
 * @param setup - What was chosen.
 */
export function saveSetup(storage: Storage, setup: Setup): void {
  try {
    storage.setItem(KEY, JSON.stringify(setup));
  } catch {
    // Storage refused. The session still runs, and setup is asked again next time.
  }
}

/**
 * Forget the stored setup, so the screen is shown again.
 *
 * @param storage - Where it was kept.
 */
export function clearSetup(storage: Storage): void {
  try {
    storage.removeItem(KEY);
  } catch {
    // Nothing was stored if storage is refused.
  }
}
