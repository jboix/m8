/** The composition root: the bus, the senses, the character, and the panel that watches them. */

import { DEFAULT_LANGUAGE, type Setup } from '@m8/shared';
import {
  lazy,
  type RefObject,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createCompany, describeCompany, NAME_FACE_ANSWERS } from './brain/company.ts';
import type { LocalTools } from './brain/dispatch.ts';
import { type Brain, useBrain } from './brain/use-brain.ts';
import type { Bus } from './bus/bus.ts';
import { createBus } from './bus/bus.ts';
import { useDebugToggle } from './debug/use-debug-toggle.ts';
import { Doorway, useDoorway } from './doorway.tsx';
import { Eyes, type EyesController } from './eyes/index.ts';
import { useFusion } from './fusion/use-fusion.ts';
import type { Gemini } from './gemini/use-gemini.ts';
import { useKnownFaces } from './memory/use-known-faces.ts';
import { useHearing } from './senses/audio/use-hearing.ts';
import { usePointerSense } from './senses/use-pointer-sense.ts';
import { usePresence } from './senses/use-presence.ts';
import type { Learnable } from './senses/vision/derive.ts';
import { type FaceOptions, useVision } from './senses/vision/use-vision.ts';
import { offersRig } from './settings/developer.ts';
import { SettingsSheet } from './settings/settings-sheet.tsx';
import { SETTINGS_STRINGS } from './settings/strings.ts';
import { useSwitches } from './settings/use-switches.ts';
import { greetingLine, STRINGS } from './setup/strings.ts';
import { type RigLayoutControl, useRigLayout } from './sheet/use-rig-layout.ts';
import { StageControls } from './stage-controls.tsx';
import { stageNotice } from './stage-notice.ts';
import { useAudioUnlocked } from './use-audio-unlocked.ts';
import { useTabVisible } from './use-tab-visible.ts';
import type { FoleySettings } from './voice/foley-cues.ts';
import { useFoley } from './voice/use-foley.ts';

/**
 * The rig. Every build has it as a chunk of its own, loaded the first time it
 * opens, so a person who never turns on the developer options never loads it.
 */
const DebugPanel = lazy(() =>
  import('./debug/debug-panel.tsx').then((rig) => ({ default: rig.DebugPanel })),
);

/** What the session is told before anybody has been through setup. It never opens. */
const NOBODY: Setup = { language: DEFAULT_LANGUAGE, name: 'nobody' };

/**
 * The application.
 *
 * @remarks
 * The eyes are mounted once and never remounted. During setup their cell is a
 * strip above the card; when setup finishes the strip grows to the whole
 * window, and the stage refits itself, so the same pair that watched the mouse
 * over the settings is the pair that ends up in the middle of the screen.
 *
 * @returns The stage, with the setup card under it until setup is done, and
 * the rig or the settings beside or below it when one of them is open. The
 * panel is a grid cell rather than an overlay, so opening it shrinks the stage
 * and the character stays fully visible.
 */
export function App() {
  const { setup, access, gemini, awakened, asking, upstream } = useDoorway();
  const stage = useRef<HTMLDivElement>(null);
  const introduce = awakened && setup.fresh;
  const { running, locked } = useRunning(awakened);
  const character = useCharacter(setup.setup ?? NOBODY, running, introduce, stage, upstream);
  const panels = usePanels(awakened && character.controller !== null);
  const rigLayout = useRigLayout();

  return (
    // The key screen borrows the setup screen's layout: the eyes in a strip, the card under them.
    <main
      className="m8-app"
      ref={rigLayout.main}
      {...layoutOf(panels.panel, rigLayout)}
      data-setup={asking ? 'asking' : setup.phase}
    >
      <div className="m8-stage-cell" ref={stage}>
        <Eyes bus={character.bus} onReady={character.onReady} />
      </div>
      {awakened ? (
        <Instruments
          character={character}
          gemini={gemini}
          who={setup.setup ?? NOBODY}
          locked={locked}
          rigLayout={rigLayout}
          {...panels}
          onSetupAgain={setup.reset}
        />
      ) : (
        <Doorway access={access} gemini={gemini} setup={setup} />
      )}
    </main>
  );
}

/**
 * The grid's attributes for the open panel.
 *
 * @param panel - Which panel is open, if any.
 * @param rigLayout - Where the rig is docked and how big it is.
 * @returns The panel's name, and while the rig is open its dock and its size,
 * which the grid in styles.css reads.
 */
function layoutOf(panel: Panel, rigLayout: RigLayoutControl) {
  if (panel !== 'rig') return { 'data-panel': panel };
  return { 'data-panel': panel, 'data-dock': rigLayout.dock, style: rigLayout.style };
}

/**
 * Which panel is open beside the stage. The rig and the settings are both
 * sheets in the same grid cell, so at most one shows, and the rig wins.
 *
 * @param ready - False until the character is awake and the rig has mounted.
 * Nothing opens before that.
 * @returns The open panel, the rig's toggle, the settings' switch, and the
 * way from the settings into the rig.
 */
function usePanels(
  ready: boolean,
): Pick<InstrumentsProps, 'panel' | 'onToggle' | 'onSettings' | 'onOpenRig'> {
  const { shown, toggle } = useDebugToggle();
  const [settingsOpen, setSettingsOpen] = useState(false);
  // The settings are open only while the rig is shut, so the toggle opens it.
  const onOpenRig = () => {
    setSettingsOpen(false);
    toggle();
  };
  const ways = { onToggle: toggle, onSettings: setSettingsOpen, onOpenRig };
  if (!ready) return { panel: undefined, ...ways };
  return { panel: shown ? 'rig' : settingsOpen ? 'settings' : undefined, ...ways };
}

/**
 * Whether the senses and the session may run.
 *
 * @param awakened - False until setup is done.
 * @returns `running` once setup is done, the tab can be seen and the browser
 * allows sound. A tab nobody can see holds no camera, no microphone and no
 * session. `locked` while only the browser's wait for a touch is in the way.
 */
function useRunning(awakened: boolean): { running: boolean; locked: boolean } {
  const visible = useTabVisible();
  const unlocked = useAudioUnlocked();
  return { running: awakened && visible && unlocked, locked: awakened && !unlocked };
}

/** Which panel is open beside the stage, if any. The rig wins when both are asked for. */
type Panel = 'rig' | 'settings' | undefined;

/** What {@link Instruments} needs. */
interface InstrumentsProps {
  /** Where the rig is docked and how big it is. */
  rigLayout: RigLayoutControl;
  /** Everything the character is made of. */
  character: ReturnType<typeof useCharacter>;
  /** The Gemini account, for the settings. */
  gemini: Gemini;
  /** The language and the name he was set up with. */
  who: Setup;
  /** True while the browser is waiting for a touch before it allows sound. */
  locked: boolean;
  /** Which panel is open. */
  panel: Panel;
  /** Opens and closes the rig. */
  onToggle: () => void;
  /** Opens and closes the settings. */
  onSettings: (open: boolean) => void;
  /** Closes the settings and opens the rig. */
  onOpenRig: () => void;
  /** Forgets the setup and shows its screen again. */
  onSetupAgain: () => void;
}

/** What {@link StageNotice} needs. */
type StageNoticeProps = Pick<InstrumentsProps, 'character' | 'who' | 'locked'>;

/**
 * The line under the eyes that says something is wrong.
 *
 * @param props - The character, for the camera's and the session's state, the
 * language the line is in, and whether the browser is waiting for a touch.
 * @returns The line, or nothing when all is well.
 */
function StageNotice({ character, who, locked }: StageNoticeProps) {
  const { vision, brain, listening, present } = character;
  const notice = stageNotice({
    tapToWake: locked ? STRINGS[who.language].tapToWake : null,
    cameraFault: vision.status === 'failed' ? vision.message : null,
    session: brain.state,
    sessionDetail: brain.detail,
    sessionWanted: listening && (present || vision.status !== 'running'),
  });
  return notice ? (
    <p className="m8-fault-line" role="status" data-asking={locked}>
      {notice}
    </p>
  ) : null;
}

/**
 * The rig, loaded the first time it is opened.
 *
 * @param props - The character, the setup, the way out, and the rig's layout.
 * @returns The rig, or nothing while it loads or before the eyes have mounted.
 */
function Rig({ character, who, onSetupAgain, onToggle, rigLayout }: InstrumentsProps) {
  if (!character.controller) return null;
  return (
    <Suspense fallback={null}>
      <DebugPanel
        {...character}
        controller={character.controller}
        who={who}
        onSetupAgain={onSetupAgain}
        onClose={onToggle}
        layout={rigLayout}
      />
    </Suspense>
  );
}

/**
 * Everything around the character once he is awake: the rig or the settings
 * when one is open, otherwise the controls and the line that says something is
 * wrong.
 *
 * @param props - The character and the panel's state.
 * @returns The open panel, or the stage chrome.
 */
function Instruments(props: InstrumentsProps) {
  const { character, gemini, who, panel, onSettings, onSetupAgain } = props;
  if (panel === 'rig' && character.controller) return <Rig {...props} />;
  if (panel === 'settings') {
    return (
      <SettingsSheet
        settings={character.settings}
        onSettings={character.onSettings}
        faces={character.faces}
        faceToLearn={character.faceToLearn}
        gemini={gemini}
        who={who}
        onSetupAgain={onSetupAgain}
        onOpenRig={props.onOpenRig}
        onClose={() => onSettings(false)}
      />
    );
  }
  return <StageChrome {...props} />;
}

/**
 * What sits on the stage around the eyes: the controls, the way into the rig
 * among them when the developer options are on, and the notice line.
 *
 * @param props - The character, the setup, and the ways into the settings and the rig.
 * @returns The controls and the notice.
 */
function StageChrome({ character, who, locked, onToggle, onSettings }: InstrumentsProps) {
  return (
    <>
      <StageControls
        muted={character.muted}
        onMuted={character.onMuted}
        camera={character.camera}
        onCamera={character.onCamera}
        talk={
          character.settings.listensTo === 'button'
            ? { talking: character.talking, onTalking: character.onTalking, bus: character.bus }
            : null
        }
        strings={SETTINGS_STRINGS[who.language]}
        onSettings={() => {
          onSettings(true);
        }}
        onRig={offersRig(character.settings, import.meta.env.DEV) ? onToggle : null}
      />
      <StageNotice character={character} who={who} locked={locked} />
    </>
  );
}

/**
 * The senses, and which of them currently has an opinion.
 *
 * @remarks
 * The camera and the mouse publish the same events at the same priority, so
 * only one of them can speak at a time. The camera is the real sense and wins
 * whenever it is actually running.
 *
 * @param bus - Where they publish.
 * @param camera - Whether the camera is wanted.
 * @param mouse - Whether the mouse may stand in for a face.
 * @param stage - Where the eyes are drawn, which the mouse is measured from.
 * @param faces - Whether to recognise faces, and which ones he knows.
 * @returns What vision is doing, and whether it is doing it.
 */
function useSenses(
  bus: Bus,
  camera: boolean,
  mouse: boolean,
  stage: RefObject<HTMLElement | null>,
  faces: FaceOptions,
) {
  const vision = useVision(bus, camera, faces);
  const seeing = camera && vision.state.status === 'running';
  usePointerSense(bus, mouse && !seeing, stage);
  return { vision, seeing };
}

/**
 * Make him introduce himself, once, in the session that follows the setup screen.
 *
 * @remarks
 * The line is handed over as soon as setup is done. The session is still
 * opening at that point, and `say` holds it until there is somewhere to send it.
 *
 * @param who - The language and the name.
 * @param due - True only when setup was finished in this tab, not read from storage.
 * @param say - Puts a line into the session.
 */
function useIntroduction(
  who: Setup,
  due: boolean,
  say: (text: string, answer: boolean) => void,
): void {
  const introduced = useRef<Setup | null>(null);
  useEffect(() => {
    if (!due || introduced.current === who) return;
    introduced.current = who;
    say(greetingLine(who.language, who.name), true);
  }, [who, due, say]);
}

/**
 * The eyes' own sounds. They play into his voice's output, so they exist only
 * while a session has a voice running.
 *
 * @param controller - The rig, or null before it has mounted.
 * @param brain - Supplies the output and whether he is talking.
 * @param settings - Which sounds are on.
 * @returns A way to fire one sound by itself, for the debug panel.
 */
function useEyeSounds(
  controller: EyesController | null,
  brain: Pick<Brain, 'foley' | 'speaking'>,
  settings: FoleySettings,
) {
  const { foley, speaking } = brain;
  const source = useMemo(() => ({ foley, speaking }), [foley, speaking]);
  return useFoley(controller?.inspector ?? null, source, settings);
}

/**
 * Learn the face in front of him under a name, or say why not.
 *
 * @param name - The name.
 * @param learnable - What vision has to offer.
 * @param learn - Stores a face under a name.
 * @returns A sentence for the model.
 */
function nameFace(
  name: string,
  learnable: Learnable,
  learn: (name: string, embedding: number[]) => void,
): string {
  const { embedding, inView } = learnable;
  if (!embedding) return inView > 0 ? NAME_FACE_ANSWERS.notYet : NAME_FACE_ANSWERS.nobody;
  learn(name, embedding);
  return NAME_FACE_ANSWERS.learned(name);
}

/**
 * The tools that answer from what the browser knows: who is in front of him,
 * and learning a face under a name.
 *
 * @param bus - Where the faces are reported.
 * @param knowsFaces - Whether recognition is on.
 * @param faceToLearn - The face in front of him, from vision.
 * @param learn - Stores a face under a name.
 * @returns The two tools, and the faces he knows.
 */
function useLocalTools(
  bus: Bus,
  knowsFaces: boolean,
  faceToLearn: () => Learnable,
  learn: (name: string, embedding: number[]) => void,
): LocalTools {
  const company = useMemo(() => createCompany(bus), [bus]);
  useEffect(() => () => company.stop(), [company]);
  return useMemo(
    () => ({
      whoIsHere: () => describeCompany(company.present(), knowsFaces),
      nameFace: (name) =>
        knowsFaces ? nameFace(name, faceToLearn(), learn) : NAME_FACE_ANSWERS.facesOff,
    }),
    [company, knowsFaces, faceToLearn, learn],
  );
}

/**
 * The senses and the faces they recognise, wired together.
 *
 * @param bus - Where the senses publish.
 * @param switches - The camera and mouse switches, and whether he knows faces.
 * @param running - Whether the senses may run at all.
 * @param stage - Where the eyes are drawn, which the mouse is measured from.
 * @returns The senses, the faces he knows, and the tools that answer from them.
 */
function useSensesAndFaces(
  bus: Bus,
  switches: { camera: boolean; mouse: boolean; knowsFaces: boolean },
  running: boolean,
  stage: RefObject<HTMLElement | null>,
) {
  const { camera, mouse, knowsFaces } = switches;
  const faces = useKnownFaces(knowsFaces);
  const faceOptions = useMemo(
    () => ({ knowsFaces, known: faces.known }),
    [knowsFaces, faces.known],
  );
  const senses = useSenses(bus, running && camera, mouse, stage, faceOptions);
  const local = useLocalTools(bus, knowsFaces, senses.vision.faceToLearn, faces.learn);
  return { senses, faces, local };
}

/** What the mind is given besides the switches. */
interface MindInputs {
  /** The language and the name from setup. */
  who: Setup;
  /** False until setup is done, and while the tab is hidden. */
  running: boolean;
  /** True when setup was finished in this tab, so he introduces himself. */
  introduce: boolean;
  /** Whether the camera is running, so presence means something. */
  seeing: boolean;
  /** The camera, for the frames he is shown. */
  stream: MediaStream | null;
  /** The tools that answer from what the browser knows. */
  local: LocalTools;
  /** The masked Gemini key and the live model. A change reopens the session. */
  upstream: string;
}

/**
 * The session, fusion and ambient hearing: everything that talks or listens.
 *
 * @param bus - Where everything meets.
 * @param controller - The rig, or null before it has mounted.
 * @param switches - Listening, hearing, noticing, the voice and mute.
 * @param inputs - The setup, the camera and the local tools.
 * @returns The brain, presence, fusion and the ears.
 */
function useMind(
  bus: Bus,
  controller: EyesController | null,
  switches: ReturnType<typeof useSwitches>,
  inputs: MindInputs,
) {
  const { listening, hearing, noticing, sound, muted, talking } = switches;
  const { who, running, introduce, seeing, stream, local, upstream } = inputs;
  // Presence gates the session: an empty room bills by the minute, and a
  // character that keeps talking to nobody is worse than one that dozes off.
  // With no camera there is nobody to detect, so the switch alone decides.
  const present = usePresence(bus);
  const awake = running && listening && (present || !seeing);
  const brain = useBrain(
    controller?.controls ?? null,
    awake,
    sound,
    who,
    { listening: switches.settings.listensTo, upstream },
    { bus, stream, muted, talking, local },
  );
  useIntroduction(who, introduce, brain.say);
  // Fusion runs whether or not the session is up. Lines it produces while the
  // brain is still connecting are held and delivered, which is how the
  // character gets to greet somebody for arriving rather than miss it.
  const fusion = useFusion(bus, brain.say, brain.floor, noticing && running);
  // Ambient hearing is not gated by presence: an empty room is exactly where
  // music starting is worth noticing. It is gated by the microphone switch,
  // because it is the same device and the same indicator light.
  const ears = useHearing(bus, brain.speaking, running && listening && hearing && !muted);

  return { brain, present, fusion, ears };
}

/**
 * Everything the character is made of, started once and held for the life of
 * the tab.
 *
 * @param who - The language and the name from setup.
 * @param running - False until setup is done, and while the tab is hidden. The
 * camera, the microphones and the session all stay shut, so the browser asks
 * for nothing while somebody is still choosing a language, and only the mouse
 * is followed.
 * @param introduce - True when setup was finished in this tab, so he introduces himself.
 * @param stage - Where the eyes are drawn.
 * @param upstream - The masked Gemini key and the live model. A change reopens the session.
 * @returns The bus, the rig, the senses and the session, plus the switches the
 * debug panel drives them with.
 */
function useCharacter(
  who: Setup,
  running: boolean,
  introduce: boolean,
  stage: RefObject<HTMLElement | null>,
  upstream: string,
) {
  const [controller, setController] = useState<EyesController | null>(null);
  const switches = useSwitches();
  const { camera, mouse, foley } = switches;

  // One bus for the life of the tab. Everything in the browser meets on it.
  const bus = useMemo(() => createBus(), []);
  const { senses, faces, local } = useSensesAndFaces(
    bus,
    { camera, mouse, knowsFaces: switches.settings.knowsFaces },
    running,
    stage,
  );
  const { seeing, vision } = senses;
  const { brain, present, fusion, ears } = useMind(bus, controller, switches, {
    ...{ who, running, introduce, seeing, stream: vision.stream, local, upstream },
  });
  const onPlayFoley = useEyeSounds(controller, brain, foley);
  const onReady = useCallback((ready: EyesController) => {
    setController(ready);
  }, []);

  return {
    bus,
    controller,
    onReady,
    ...switches,
    faces,
    faceToLearn: senses.vision.faceToLearn,
    mouseActive: mouse && !senses.seeing,
    ...{ vision: senses.vision.state, stream: senses.vision.stream },
    ...{ brain, present, fusion, ears, onPlayFoley },
  };
}
