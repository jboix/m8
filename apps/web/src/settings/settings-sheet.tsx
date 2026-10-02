/**
 * The settings sheet: what a person may change about him, in five tabs. It is
 * a column beside the stage, and a bottom sheet under it on a phone, like the
 * rig. The title, the close button and the tabs stay put while the tab scrolls.
 */
import type { Settings, Setup } from '@m8/shared';
import { useRef } from 'react';
import { GeminiSection } from '../gemini/gemini-section.tsx';
import { GEMINI_STRINGS } from '../gemini/strings.ts';
import type { Gemini } from '../gemini/use-gemini.ts';
import type { KnownFacesView } from '../memory/use-known-faces.ts';
import type { Learnable } from '../senses/vision/derive.ts';
import { useSheetDrag } from '../sheet/use-sheet-drag.ts';
import { USAGE_STRINGS } from '../usage/strings.ts';
import { UsageSection } from '../usage/usage-section.tsx';
import { FacesSection } from './faces-section.tsx';
import { GeneralTab } from './general-tab.tsx';
import { MemorySection } from './memory-section.tsx';
import { SettingsTabPanel, SettingsTabStrip, useSettingsTab } from './settings-tabs.tsx';
import { SETTINGS_STRINGS } from './strings.ts';
import type { SettingsTab } from './tab-memory.ts';

/** What the sheet needs. */
export interface SettingsSheetProps {
  /** The settings as they are. */
  settings: Settings;
  /** Changes some of them. Every change takes effect, and is stored, at once. */
  onSettings: (change: Partial<Settings>) => void;
  /** Who he was set up for, which also decides the sheet's language. */
  who: Setup;
  /** The faces he knows and the ways to change them. */
  faces: KnownFacesView;
  /** The face in front of the camera, ready to learn, and how many faces are in view. */
  faceToLearn: () => Learnable;
  /** The Gemini key, the models and the daily limit. */
  gemini: Gemini;
  /** Forgets the setup and shows its screen again. */
  onSetupAgain: () => void;
  /** Closes the sheet and opens the rig. */
  onOpenRig: () => void;
  /** Closes the sheet. */
  onClose: () => void;
}

/**
 * Each tab's name in the sheet's language.
 *
 * @param who - The setup, for the language.
 * @returns The names.
 */
function tabNames(who: Setup): Record<SettingsTab, string> {
  const strings = SETTINGS_STRINGS[who.language];
  return {
    general: strings.general,
    people: strings.people,
    memory: strings.memory,
    gemini: GEMINI_STRINGS[who.language].heading,
    usage: USAGE_STRINGS[who.language].heading,
  };
}

/**
 * The five tabs' contents, the closed ones hidden.
 *
 * @param props - Everything the sheet was given, and the open tab.
 * @returns The panels.
 */
function Panels(props: SettingsSheetProps & { tab: SettingsTab }) {
  const { who, tab } = props;
  return (
    <>
      <SettingsTabPanel tab="general" selected={tab}>
        <GeneralTab {...props} />
      </SettingsTabPanel>
      <SettingsTabPanel tab="people" selected={tab}>
        <FacesSection
          language={who.language}
          name={who.name}
          knowsFaces={props.settings.knowsFaces}
          onSettings={props.onSettings}
          faces={props.faces}
          faceToLearn={props.faceToLearn}
        />
      </SettingsTabPanel>
      <SettingsTabPanel tab="memory" selected={tab}>
        <section>
          <MemorySection language={who.language} />
        </section>
      </SettingsTabPanel>
      <SettingsTabPanel tab="gemini" selected={tab}>
        <GeminiSection gemini={props.gemini} language={who.language} />
      </SettingsTabPanel>
      <SettingsTabPanel tab="usage" selected={tab}>
        <UsageSection language={who.language} />
      </SettingsTabPanel>
    </>
  );
}

/**
 * The settings sheet.
 *
 * @remarks
 * It is mounted only while it is open, like the rig, so the memory, the
 * account and the usage are read fresh each time it opens.
 *
 * @param props - The settings, the setup, and the ways to change and close.
 * @returns The sheet: a column beside the stage, or a sheet under it on a phone.
 */
export function SettingsSheet(props: SettingsSheetProps) {
  const { who, onClose } = props;
  const strings = SETTINGS_STRINGS[who.language];
  const drag = useSheetDrag(onClose);
  const body = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useSettingsTab();

  return (
    <aside
      className="m8-sheet m8-settings"
      lang={who.language}
      aria-labelledby="m8-settings-title"
      ref={drag.sheet}
    >
      <header {...drag.handlers}>
        <h2 id="m8-settings-title">{strings.title}</h2>
        <button type="button" className="m8-close" onClick={onClose} aria-label={strings.close}>
          <svg viewBox="0 0 12 12" aria-hidden="true">
            <path d="M2 2l8 8M10 2l-8 8" />
          </svg>
        </button>
        <SettingsTabStrip
          label={strings.title}
          names={tabNames(who)}
          selected={tab}
          onSelect={(next) => {
            setTab(next);
            body.current?.scrollTo({ top: 0 });
          }}
        />
      </header>
      <div className="m8-sheet-body m8-settings-body" ref={body}>
        <Panels {...props} tab={tab} />
      </div>
    </aside>
  );
}
