/**
 * The settings sheet's General tab: sound, behaviour, who he was set up for,
 * and the developer options that offer the rig.
 */
import { LANGUAGE_NAMES, ListeningChoice, type Settings, type Setup, VoiceName } from '@m8/shared';
import { offersRig } from './developer.ts';
import { SliderRow, SwitchRow } from './rows.tsx';
import { SETTINGS_STRINGS } from './strings.ts';

/** What the tab needs. */
export interface GeneralTabProps {
  /** The settings as they are. */
  settings: Settings;
  /** Changes some of them. Every change takes effect, and is stored, at once. */
  onSettings: (change: Partial<Settings>) => void;
  /** Who he was set up for, which also decides the language. */
  who: Setup;
  /** Forgets the setup and shows its screen again. */
  onSetupAgain: () => void;
  /** Closes the settings and opens the rig. */
  onOpenRig: () => void;
}

/**
 * Everything about sound.
 *
 * @param props - The settings, the way to change them, and the language.
 * @returns The section.
 */
function SoundSection({ settings, onSettings, who }: GeneralTabProps) {
  const strings = SETTINGS_STRINGS[who.language];
  return (
    <section>
      <h3>{strings.sound}</h3>
      <SwitchRow
        label={strings.eyeSounds}
        on={settings.eyeSounds}
        onChange={(eyeSounds) => onSettings({ eyeSounds })}
      />
      <SliderRow
        label={strings.eyeSoundVolume}
        value={settings.eyeSoundVolume}
        disabled={!settings.eyeSounds}
        onChange={(eyeSoundVolume) => onSettings({ eyeSoundVolume })}
      />
      <SliderRow
        label={strings.robot}
        value={settings.robot}
        onChange={(robot) => onSettings({ robot })}
      />
      <label className="m8-setting">
        <span>{strings.voice}</span>
        <select
          value={settings.voice}
          onChange={(event) => onSettings({ voice: VoiceName.parse(event.target.value) })}
        >
          {VoiceName.options.map((voice) => (
            <option key={voice}>{voice}</option>
          ))}
        </select>
      </label>
      <p className="m8-setting-hint">{strings.voiceHint}</p>
    </section>
  );
}

/**
 * How he behaves.
 *
 * @param props - The settings, the way to change them, and the language.
 * @returns The section.
 */
function BehaviourSection({ settings, onSettings, who }: GeneralTabProps) {
  const strings = SETTINGS_STRINGS[who.language];
  return (
    <section>
      <h3>{strings.behaviour}</h3>
      <SwitchRow
        label={strings.roomSounds}
        on={settings.roomSounds}
        onChange={(roomSounds) => onSettings({ roomSounds })}
      />
      <SwitchRow
        label={strings.speaksUp}
        on={settings.speaksUp}
        onChange={(speaksUp) => onSettings({ speaksUp })}
      />
      <label className="m8-setting">
        <span>{strings.listensTo}</span>
        <select
          value={settings.listensTo}
          onChange={(event) => onSettings({ listensTo: ListeningChoice.parse(event.target.value) })}
        >
          <option value="everyone">{strings.listensToEveryone}</option>
          <option value="button">{strings.listensToButton}</option>
        </select>
      </label>
      <p className="m8-setting-hint">{strings.listensToHint}</p>
    </section>
  );
}

/**
 * Who he was set up for, and a way to set him up again.
 *
 * @param props - The setup and the way to start it over.
 * @returns The section.
 */
function YouSection({ who, onSetupAgain }: GeneralTabProps) {
  const strings = SETTINGS_STRINGS[who.language];
  const setUpFor = strings.setUpFor
    .replace('{name}', who.name)
    .replace('{language}', LANGUAGE_NAMES[who.language].native);
  return (
    <section>
      <h3>{strings.you}</h3>
      <div className="m8-setting">
        <span>{setUpFor}</span>
        <button type="button" className="m8-setting-button" onClick={onSetupAgain}>
          {strings.setUpAgain}
        </button>
      </div>
    </section>
  );
}

/**
 * The developer switch, and the button into the rig while it is on. A
 * development build always offers the rig, so there the switch stays on.
 *
 * @param props - The settings, the way to change them, and the way into the rig.
 * @returns The section.
 */
function DeveloperSection({ settings, onSettings, who, onOpenRig }: GeneralTabProps) {
  const strings = SETTINGS_STRINGS[who.language];
  const devBuild = import.meta.env.DEV;
  return (
    <section>
      <SwitchRow
        label={strings.developer}
        on={offersRig(settings, devBuild)}
        disabled={devBuild}
        onChange={(developer) => onSettings({ developer })}
      />
      <p className="m8-setting-hint">
        {strings.developerHint}
        {devBuild ? ` ${strings.developerAlwaysOn}` : null}
      </p>
      {offersRig(settings, devBuild) ? (
        <button type="button" className="m8-setting-button" onClick={onOpenRig}>
          {strings.openRig}
        </button>
      ) : null}
    </section>
  );
}

/**
 * The General tab.
 *
 * @param props - The settings, the setup, and the ways to change them and to open the rig.
 * @returns The four sections.
 */
export function GeneralTab(props: GeneralTabProps) {
  return (
    <>
      <SoundSection {...props} />
      <BehaviourSection {...props} />
      <YouSection {...props} />
      <DeveloperSection {...props} />
    </>
  );
}
