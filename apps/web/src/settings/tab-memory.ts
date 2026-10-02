/** The settings sheet's tabs, which one was open last, and how the keys move between them. */

/** The tabs, in the order they are shown. */
export const SETTINGS_TABS = ['general', 'people', 'memory', 'gemini', 'usage'] as const;

/** One of the tabs. */
export type SettingsTab = (typeof SETTINGS_TABS)[number];

/** The storage key for the open tab. */
const TAB_KEY = 'm8.settings.tab';

/**
 * Read the tab that was open last.
 *
 * @param storage - Where it was kept.
 * @returns That tab, or the first one when none is stored, the value is not a
 * tab, or storage is refused.
 */
export function loadTab(storage: Storage): SettingsTab {
  try {
    const stored = storage.getItem(TAB_KEY);
    return SETTINGS_TABS.find((tab) => tab === stored) ?? 'general';
  } catch {
    // Storage refused in a private window.
    return 'general';
  }
}

/**
 * Remember the open tab.
 *
 * @param storage - Where to keep it.
 * @param tab - The tab that is open.
 */
export function saveTab(storage: Storage, tab: SettingsTab): void {
  try {
    storage.setItem(TAB_KEY, tab);
  } catch {
    // Storage refused. The tab still opens, it is only not remembered.
  }
}

/**
 * The tab a key press moves to, as the ARIA tabs pattern asks.
 *
 * @param tab - The open tab.
 * @param key - The key, as `KeyboardEvent.key` names it.
 * @returns The next or previous tab for the arrows, wrapping at the ends, the
 * first or the last for Home and End, or null for any other key.
 */
export function tabForKey(tab: SettingsTab, key: string): SettingsTab | null {
  const last = SETTINGS_TABS.length - 1;
  const at = SETTINGS_TABS.indexOf(tab);
  const index: Record<string, number> = {
    ArrowRight: at === last ? 0 : at + 1,
    ArrowLeft: at === 0 ? last : at - 1,
    Home: 0,
    End: last,
  };
  const next = index[key];
  return next === undefined ? null : (SETTINGS_TABS[next] ?? null);
}
