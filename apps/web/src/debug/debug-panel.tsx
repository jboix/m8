/**
 * The rig: the panel that drives and watches the character. It is the only way
 * to see what the rig is doing, because the loop deliberately keeps React out of
 * the animation.
 *
 * Four tabs, named by what is done in them. Each carries a lamp, so the panel
 * says what is happening in the tabs that are not open.
 */
import '../memory.css';
// Before instruments.css, whose phone and touch rules have to win over these.
import './console.css';
import './dock.css';
import '../instruments.css';
import { LANGUAGE_NAMES, type Setup } from '@m8/shared';
import { useEffect, useState } from 'react';
import type { Brain, VoiceSettings } from '../brain/use-brain.ts';
import type { Bus } from '../bus/bus.ts';
import type { EyesController } from '../eyes/index.ts';
import type { FusionState } from '../fusion/fusion.ts';
import type { HearingState } from '../senses/audio/start-hearing.ts';
import type { VisionState } from '../senses/vision/start-vision.ts';
import type { RigLayoutControl } from '../sheet/use-rig-layout.ts';
import { type SheetDrag, useSheetDrag } from '../sheet/use-sheet-drag.ts';
import type { FoleySound } from '../voice/foley.ts';
import type { FoleySettings } from '../voice/foley-cues.ts';
import { EventTimeline } from './event-timeline.tsx';
import { FaceTab } from './face-tab.tsx';
import { FusionPanel } from './fusion-panel.tsx';
import { HearingStatus } from './hearing-status.tsx';
import { MemoryTab } from './memory-tab.tsx';
import { RecordingControls } from './recording-controls.tsx';
import { DockButton, RigResizer } from './rig-resizer.tsx';
import { SessionInspector } from './session-inspector.tsx';
import { type Lamp, TabPanel, type TabSpec, Tabs } from './tabs.tsx';
import { VisionPreview } from './vision-preview.tsx';
import { VisionStatus } from './vision-status.tsx';

/** The tabs, by what is done in each. */
type TabId = 'face' | 'mind' | 'senses' | 'memory' | 'log';

/** Every tab, in the order the bar shows them. */
const TAB_IDS: readonly TabId[] = ['face', 'mind', 'senses', 'memory', 'log'];

/** Where the open tab is remembered, so closing the rig does not lose the place. */
const TAB_KEY = 'm8.rig.tab';

/** How often the gaze is sampled for the senses tab. */
const GAZE_MS = 250;

/** What the panel drives. */
interface DebugPanelProps {
  /** The bus the timeline shows and the recorder captures. */
  bus: Bus;
  /** Where the rig is docked and how big it is. */
  layout: RigLayoutControl;
  /** The running rig. */
  controller: EyesController;
  /** What tier 1 vision is doing. */
  vision: VisionState;
  /** The camera, for the preview. */
  stream: MediaStream | null;
  /** Whether the camera is wanted. */
  camera: boolean;
  /** Turns the camera on and off, to measure the renderer without it. */
  onCamera: (wanted: boolean) => void;
  /** Whether the mouse may stand in for a face. */
  mouse: boolean;
  /** Turns that on and off. */
  onMouse: (wanted: boolean) => void;
  /** Whether it is actually publishing, which a running camera suppresses. */
  mouseActive: boolean;
  /** What the live session is doing, and the way to put words into it. */
  brain: Brain;
  /** Whether a live session is wanted. */
  listening: boolean;
  /** Opens and closes it. */
  onListening: (wanted: boolean) => void;
  /** Whether anyone is there. */
  present: boolean;
  /** What the second, raw microphone track is doing. */
  ears: HearingState;
  /** Whether that track is wanted. */
  hearing: boolean;
  /** Opens and closes it. */
  onHearing: (wanted: boolean) => void;
  /** How the character sounds. */
  sound: VoiceSettings;
  /** Changes it. */
  onSound: (sound: VoiceSettings) => void;
  /** What it is noticing. */
  fusion: FusionState;
  /** Whether it is allowed to notice anything. */
  noticing: boolean;
  /** Turns that off. */
  onNoticing: (wanted: boolean) => void;
  /** Which of the eyes' sounds are on. */
  foley: FoleySettings;
  /** Changes them. */
  onFoley: (settings: FoleySettings) => void;
  /** Plays one of the eyes' sounds now. */
  onPlayFoley: (sound: FoleySound) => void;
  /** The language and the name he was set up with. */
  who: Setup;
  /** Forgets them and shows the setup screen again. */
  onSetupAgain: () => void;
  /** Closes the panel. The only way out on a device with no keyboard. */
  onClose: () => void;
}

/**
 * What the mind tab's lamp shows: where the live session is up to.
 *
 * @param state - The session's state.
 * @returns The lamp.
 */
function sessionLamp(state: Brain['state']): Lamp {
  if (state === 'live') return 'on';
  if (state === 'failed') return 'fault';
  return state === 'sleeping' ? 'off' : 'busy';
}

/**
 * What the senses tab's lamp shows: the camera, or the ears when the camera is fine.
 *
 * @param vision - What the camera is doing.
 * @param ears - What ambient hearing is doing.
 * @returns The lamp. A fault in either one wins, because that is what needs looking at.
 */
function sensesLamp(vision: VisionState, ears: HearingState): Lamp {
  if (vision.status === 'failed' || ears.status === 'failed') return 'fault';
  if (vision.status === 'running') return 'on';
  return vision.status === 'starting' || vision.status === 'loading' ? 'busy' : 'off';
}

/**
 * Remember which tab is open, across closing and reopening the rig.
 *
 * @returns The open tab and the way to open another.
 */
function useOpenTab(): [TabId, (tab: TabId) => void] {
  const [tab, setTab] = useState<TabId>(() => {
    try {
      const stored = sessionStorage.getItem(TAB_KEY);
      return TAB_IDS.find((id) => id === stored) ?? 'face';
    } catch {
      return 'face';
    }
  });
  return [
    tab,
    (next) => {
      setTab(next);
      try {
        sessionStorage.setItem(TAB_KEY, next);
      } catch {
        // Storage refused. The tab still opens, it is only not remembered.
      }
    },
  ];
}

/**
 * Sample which claim is winning the gaze.
 *
 * @param controller - The rig.
 * @returns The winner's name, or `wandering`.
 */
function useGaze(controller: EyesController): string {
  const [gaze, setGaze] = useState(() => controller.inspector.gaze());
  useEffect(() => {
    const timer = setInterval(() => {
      setGaze(controller.inspector.gaze());
    }, GAZE_MS);
    return () => {
      clearInterval(timer);
    };
  }, [controller]);
  return gaze ?? 'wandering';
}

/**
 * The mind tab: the live session, and the boredom that makes him speak up.
 *
 * @param props - The panel's props.
 * @returns The session inspector, then fusion.
 */
function MindTab(props: DebugPanelProps) {
  const { brain, listening, onListening, present, sound, onSound } = props;
  const { fusion, noticing, onNoticing, bus } = props;
  return (
    <>
      <p className="m8-label">session</p>
      <SessionInspector {...{ brain, listening, onListening, present, sound, onSound }} />
      <p className="m8-label">boredom</p>
      <FusionPanel {...{ fusion, noticing, onNoticing, bus }} />
    </>
  );
}

/**
 * The senses tab: the camera and what it tracks, then the room's sounds.
 *
 * @param props - The panel's props.
 * @returns The camera's status and preview, then ambient hearing.
 */
function SensesTab(props: DebugPanelProps) {
  const { vision, camera, onCamera, mouse, onMouse, mouseActive } = props;
  const { ears, hearing, onHearing } = props;
  const gaze = useGaze(props.controller);
  return (
    <>
      <p className="m8-label">camera, looking at: {gaze}</p>
      <VisionStatus {...{ vision, camera, onCamera, mouse, onMouse, mouseActive }} />
      <VisionPreview stream={props.stream} bus={props.bus} />
      <p className="m8-label">room sounds</p>
      <HearingStatus {...{ ears, hearing, onHearing }} />
    </>
  );
}

/**
 * The log tab: record and replay, every event on the bus, and setup.
 *
 * @param props - The panel's props.
 * @returns The recorder, the timeline, and the way back to the setup screen.
 */
function LogTab({ bus, controller, who, onSetupAgain }: DebugPanelProps) {
  return (
    <>
      <p className="m8-label">recording</p>
      <RecordingControls bus={bus} seed={controller.inspector.seed()} />
      <p className="m8-label">events</p>
      <EventTimeline bus={bus} />
      <p className="m8-label">
        set up in {LANGUAGE_NAMES[who.language].native}, for {who.name}
      </p>
      <div className="m8-chips">
        <button type="button" className="m8-pin" onClick={onSetupAgain}>
          set up again
        </button>
      </div>
    </>
  );
}

/** What the panel's top strip needs. */
interface RigHeaderProps {
  /** The tabs, with their lamps. */
  tabs: TabSpec<TabId>[];
  /** The open tab. */
  tab: TabId;
  /** Opens another. */
  onTab: (tab: TabId) => void;
  /** Closes the rig. */
  onClose: () => void;
  /** The swipe that moves the sheet. */
  drag: SheetDrag;
  /** Where the rig is docked, for the dock button. */
  layout: RigLayoutControl;
}

/**
 * The top strip: the tabs and the way out. On a phone it is also where the
 * sheet is dragged.
 *
 * @param props - The tabs, the swipe and the way out.
 * @returns The header. It stays put while the tab under it scrolls.
 */
function RigHeader({ tabs, tab, onTab, onClose, drag, layout }: RigHeaderProps) {
  return (
    <header {...drag.handlers}>
      <Tabs tabs={tabs} selected={tab} onSelect={onTab} />
      <DockButton layout={layout} />
      <button type="button" className="m8-close" onClick={onClose} aria-label="Close the rig">
        <svg viewBox="0 0 12 12" aria-hidden="true">
          <path d="M2 2l8 8M10 2l-8 8" />
        </svg>
      </button>
    </header>
  );
}

/**
 * The rig.
 *
 * @param props - The character, its switches, and the way out.
 * @returns The panel: a column beside the stage, or a sheet under it on a phone.
 */
export function DebugPanel(props: DebugPanelProps) {
  const { controller, foley, onFoley, onPlayFoley } = props;
  const [tab, setTab] = useOpenTab();
  // On a phone the panel is a bottom sheet, and pulling its header down closes it.
  const drag = useSheetDrag(props.onClose);
  const tabs: TabSpec<TabId>[] = [
    { id: 'face', label: 'face', lamp: null },
    { id: 'mind', label: 'mind', lamp: sessionLamp(props.brain.state) },
    { id: 'senses', label: 'senses', lamp: sensesLamp(props.vision, props.ears) },
    { id: 'memory', label: 'memory', lamp: null },
    { id: 'log', label: 'log', lamp: null },
  ];

  return (
    <aside className="m8-sheet m8-debug" data-dock={props.layout.dock} ref={drag.sheet}>
      <RigResizer layout={props.layout} />
      <RigHeader
        {...{ tabs, tab, drag }}
        layout={props.layout}
        onTab={setTab}
        onClose={props.onClose}
      />
      <div className="m8-sheet-body">
        <TabPanel id="face" selected={tab}>
          <FaceTab {...{ controller, foley, onFoley, onPlayFoley }} />
        </TabPanel>
        <TabPanel id="mind" selected={tab}>
          <MindTab {...props} />
        </TabPanel>
        <TabPanel id="senses" selected={tab}>
          <SensesTab {...props} />
        </TabPanel>
        <TabPanel id="memory" selected={tab}>
          <MemoryTab open={tab === 'memory'} />
        </TabPanel>
        <TabPanel id="log" selected={tab}>
          <LogTab {...props} />
        </TabPanel>
      </div>
    </aside>
  );
}
