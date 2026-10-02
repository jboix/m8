/** The settings sheet's tab strip and its panels, with the open tab kept in the browser. */
import type { KeyboardEvent, ReactNode } from 'react';
import { useState } from 'react';
import { loadTab, SETTINGS_TABS, type SettingsTab, saveTab, tabForKey } from './tab-memory.ts';

/**
 * The open tab, read from the browser when the sheet opens and stored on every change.
 *
 * @returns The open tab and the way to open another.
 */
export function useSettingsTab(): [SettingsTab, (tab: SettingsTab) => void] {
  const [tab, setTab] = useState(() => loadTab(localStorage));
  return [
    tab,
    (next) => {
      setTab(next);
      saveTab(localStorage, next);
    },
  ];
}

/**
 * The id of a tab's button, which its panel is labelled by.
 *
 * @param tab - The tab.
 * @returns The id. Distinct from the rig's tab ids.
 */
function tabId(tab: SettingsTab): string {
  return `m8-settings-tab-${tab}`;
}

/**
 * The id of a tab's panel, which its button controls.
 *
 * @param tab - The tab.
 * @returns The id.
 */
function panelId(tab: SettingsTab): string {
  return `m8-settings-panel-${tab}`;
}

/** What the tab strip needs. */
interface SettingsTabStripProps {
  /** What the strip is called, for a screen reader. */
  label: string;
  /** Each tab's name. */
  names: Record<SettingsTab, string>;
  /** The open tab. */
  selected: SettingsTab;
  /** Opens another. */
  onSelect: (tab: SettingsTab) => void;
}

/**
 * The tab strip. The arrow keys, Home and End move between tabs and open the
 * one they reach. Only the open tab is in the page's tab order.
 *
 * @param props - The names, the open tab and the way to open another.
 * @returns The tab list.
 */
export function SettingsTabStrip({ label, names, selected, onSelect }: SettingsTabStripProps) {
  /**
   * Open the tab the key leads to, and move the focus to it.
   * @param event - The key press.
   */
  function onKeyDown(event: KeyboardEvent): void {
    const next = tabForKey(selected, event.key);
    if (!next) return;
    event.preventDefault();
    open(next);
    document.getElementById(tabId(next))?.focus();
  }

  /**
   * Open a tab and bring the whole of its name into view.
   * @param tab - The tab.
   */
  function open(tab: SettingsTab): void {
    onSelect(tab);
    document.getElementById(tabId(tab))?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  return (
    <div className="m8-settings-tabs" role="tablist" aria-label={label} onKeyDown={onKeyDown}>
      {SETTINGS_TABS.map((tab) => (
        <button
          key={tab}
          type="button"
          role="tab"
          id={tabId(tab)}
          className="m8-settings-tab"
          aria-selected={tab === selected}
          aria-controls={panelId(tab)}
          tabIndex={tab === selected ? 0 : -1}
          onClick={() => {
            open(tab);
          }}
        >
          {names[tab]}
        </button>
      ))}
    </div>
  );
}

/** What a tab's panel needs. */
interface SettingsTabPanelProps {
  /** Which tab it belongs to. */
  tab: SettingsTab;
  /** The open tab. */
  selected: SettingsTab;
  /** What it holds. */
  children: ReactNode;
}

/**
 * One tab's contents. A closed panel stays mounted and hidden, so a key being
 * typed or a list that was unfolded is still there when its tab opens again.
 *
 * @param props - Which tab this is, which one is open, and the contents.
 * @returns The panel.
 */
export function SettingsTabPanel({ tab, selected, children }: SettingsTabPanelProps) {
  return (
    <div
      role="tabpanel"
      id={panelId(tab)}
      className="m8-settings-panel"
      aria-labelledby={tabId(tab)}
      hidden={tab !== selected}
    >
      {children}
    </div>
  );
}
