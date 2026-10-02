/**
 * Everything that can be switched on and off, and where each switch lives.
 *
 * The person's settings are kept in the browser and changed from the settings
 * sheet. The rest are for the debug rig, and start over with the page.
 */
import type { Settings } from '@m8/shared';
import { useCallback, useState } from 'react';
import type { VoiceSettings } from '../brain/use-brain.ts';
import type { FoleySettings } from '../voice/foley-cues.ts';
import { loadSettings, saveSettings } from './store.ts';

/** Which kinds of eye sound are on. The rig can switch each one off to hear the others. */
type FoleyKinds = Omit<FoleySettings, 'on' | 'volume'>;

/** Every kind of eye sound, on. */
const ALL_KINDS: FoleyKinds = {
  emotion: true,
  servo: true,
  blink: true,
  squash: true,
  gesture: true,
};

/**
 * The person's settings, kept in the browser.
 *
 * @returns The settings, and a way to change some of them. A change is stored at once.
 */
function useSettings(): [Settings, (change: Partial<Settings>) => void] {
  const [settings, setSettings] = useState(() => loadSettings(localStorage));
  const change = useCallback((next: Partial<Settings>) => {
    setSettings((previous) => {
      const merged = { ...previous, ...next };
      saveSettings(localStorage, merged);
      return merged;
    });
  }, []);
  return [settings, change];
}

/**
 * The switches for the devices, which are never stored: a page that reloads
 * with the camera off would look broken.
 *
 * @returns Each switch and the setter beside it.
 */
function useDeviceSwitches() {
  const [camera, onCamera] = useState(true);
  const [mouse, onMouse] = useState(true);
  // Listening is on by default. A character that waits to be switched on is a
  // tool; this one is supposed to already be in the room. The browser still asks.
  const [listening, onListening] = useState(true);
  // The person's own mute. It releases the microphone and leaves the session open.
  const [muted, onMuted] = useState(false);
  // The talk button, held. Only read when the button marks the turns.
  const [talking, onTalking] = useState(false);
  return {
    ...{ camera, onCamera, mouse, onMouse, listening, onListening },
    ...{ muted, onMuted, talking, onTalking },
  };
}

/**
 * Everything the settings sheet and the debug rig can turn on and off.
 *
 * @returns Each switch and the setter beside it, named as the rig expects, plus
 * the person's settings as the sheet edits them. The voice, the robot effect,
 * the eye sounds, room listening and speaking up are views onto those settings,
 * so the rig and the sheet never disagree.
 */
export function useSwitches() {
  const [settings, onSettings] = useSettings();
  const [halfDuplex, setHalfDuplex] = useState(false);
  const [kinds, setKinds] = useState(ALL_KINDS);

  const sound: VoiceSettings = { voice: settings.voice, robot: settings.robot, halfDuplex };
  const foley: FoleySettings = {
    ...kinds,
    on: settings.eyeSounds,
    volume: settings.eyeSoundVolume,
  };
  return {
    ...useDeviceSwitches(),
    ...{ settings, onSettings, sound, foley },
    ...{ hearing: settings.roomSounds, noticing: settings.speaksUp },
    onHearing: (roomSounds: boolean) => onSettings({ roomSounds }),
    onNoticing: (speaksUp: boolean) => onSettings({ speaksUp }),
    onSound: ({ voice, robot, halfDuplex: held }: VoiceSettings) => {
      setHalfDuplex(held);
      onSettings({ voice, robot });
    },
    onFoley: ({ on, volume, ...rest }: FoleySettings) => {
      setKinds(rest);
      onSettings({ eyeSounds: on, eyeSoundVolume: volume });
    },
  };
}
