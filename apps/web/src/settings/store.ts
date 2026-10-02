/** Keeps the person's settings in the browser. */
import { DEFAULT_SETTINGS, Settings } from '@m8/shared';

/** The storage key. Versioned, so a change of shape can ignore what came before. */
const KEY = 'm8.settings.v1';

/**
 * Read the stored settings.
 *
 * @param storage - Where they were kept.
 * @returns The settings, or the defaults when there are none or they no longer validate.
 */
export function loadSettings(storage: Storage): Settings {
  try {
    const stored = Settings.safeParse(JSON.parse(storage.getItem(KEY) ?? 'null'));
    return stored.success ? stored.data : DEFAULT_SETTINGS;
  } catch {
    // Unparseable JSON, or storage refused in a private window.
    return DEFAULT_SETTINGS;
  }
}

/**
 * Store the settings.
 *
 * @param storage - Where to keep them.
 * @param settings - What the person chose.
 */
export function saveSettings(storage: Storage, settings: Settings): void {
  try {
    storage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // Storage refused. The settings still hold until the page is closed.
  }
}
