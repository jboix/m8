/**
 * The rig's tabs. Each one carries a lamp that shows live state, so the panel
 * says what is happening in the tabs that are not open.
 */
import type { KeyboardEvent } from 'react';

/**
 * What a tab's lamp is saying.
 *
 * - `off`: nothing to report.
 * - `on`: running.
 * - `busy`: on its way.
 * - `fault`: something failed, and the tab says what.
 */
export type Lamp = 'off' | 'on' | 'busy' | 'fault';

/** One tab. */
export interface TabSpec<Id extends string> {
  /** What selects it. */
  id: Id;
  /** What it is called. */
  label: string;
  /** Its lamp, or null for a tab with no state to show. A lamp that never lights is noise. */
  lamp: Lamp | null;
}

/** What the tab bar needs. */
interface TabsProps<Id extends string> {
  /** The tabs, in order. */
  tabs: TabSpec<Id>[];
  /** The open one. */
  selected: Id;
  /** Opens another. */
  onSelect: (id: Id) => void;
}

/** Which way each arrow key moves along the tabs. */
const ARROW_STEP: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1 };

/** What each lamp is called, for somebody who cannot see its colour. */
const LAMP_LABEL: Record<Lamp, string> = {
  off: '',
  on: ', running',
  busy: ', starting',
  fault: ', failed',
};

/**
 * The tab bar.
 *
 * @param props - The tabs, the open one, and how to open another.
 * @returns A tab list. Left and right arrows move between tabs, as the pattern asks.
 */
export function Tabs<Id extends string>({ tabs, selected, onSelect }: TabsProps<Id>) {
  /**
   * Move to the tab beside the open one.
   * @param event - The key press.
   */
  function onKeyDown(event: KeyboardEvent): void {
    const step = ARROW_STEP[event.key];
    if (step === undefined) return;
    const at = tabs.findIndex((tab) => tab.id === selected);
    const next = tabs[(at + step + tabs.length) % tabs.length];
    if (next) onSelect(next.id);
  }

  return (
    <div className="m8-tabs" role="tablist" aria-label="Rig" onKeyDown={onKeyDown}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          id={`m8-tab-${tab.id}`}
          className="m8-tab"
          aria-selected={tab.id === selected}
          aria-controls={`m8-tabpanel-${tab.id}`}
          aria-label={`${tab.label}${tab.lamp ? LAMP_LABEL[tab.lamp] : ''}`}
          tabIndex={tab.id === selected ? 0 : -1}
          onClick={() => {
            onSelect(tab.id);
          }}
        >
          {tab.label}
          {tab.lamp ? <span className="m8-lamp" data-lamp={tab.lamp} /> : null}
        </button>
      ))}
    </div>
  );
}

/** What a tab's panel needs. */
interface TabPanelProps<Id extends string> {
  /** Which tab it belongs to. */
  id: Id;
  /** The open tab. */
  selected: Id;
  /** What it holds. */
  children: React.ReactNode;
}

/**
 * One tab's contents. A closed panel stays mounted and hidden, so the event log
 * keeps collecting and a folded section stays folded while another tab is open.
 *
 * @param props - Which tab this is, which one is open, and the contents.
 * @returns The panel.
 */
export function TabPanel<Id extends string>({ id, selected, children }: TabPanelProps<Id>) {
  return (
    <div
      role="tabpanel"
      id={`m8-tabpanel-${id}`}
      aria-labelledby={`m8-tab-${id}`}
      hidden={id !== selected}
    >
      {children}
    </div>
  );
}
