/**
 * Runs the live session for as long as it is wanted: the socket, the
 * microphone, the voice, and the tools wired to the eyes.
 *
 * The eyes keep running whatever happens here. A brain that will not start is
 * something the character carries on without, which is the point of the two
 * loops in section 1.
 */
import type { Listening, SessionState, Setup, ToolInput, Voice as VoiceChoice } from '@m8/shared';
import { type RefObject, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Bus } from '../bus/bus.ts';
import type { EyesControls } from '../eyes/index.ts';
import { MicError, type Microphone, startMicrophone } from '../senses/audio/microphone.ts';
import type { FoleyOutput } from '../voice/foley.ts';
import { startVoice, type Voice } from '../voice/player.ts';
import { type Attention, createAttention } from './attention.ts';
import { type BrainClient, connectBrain, type Opening } from './client.ts';
import { dispatchTool, type LocalTools } from './dispatch.ts';
import type { Floor, FloorHolder } from './floor.ts';
import { heldFrame } from './mic-gate.ts';
import { type Shared, useMute, useShared, useTalkButton } from './shared.ts';
import { useFeeds } from './use-feeds.ts';
import { type Line, useSay } from './use-say.ts';
import { startVoiceLevels, type VoiceLevels } from './voice-levels.ts';

/** What the session is doing, and what it has said. */
export interface BrainStatus {
  /** Where the live session is up to. */
  state: SessionState['state'];
  /** Why, when something went wrong. */
  detail?: string;
  /** The conversation so far, newest last. Lines carry a sequence to key by. */
  transcript: { seq: number; role: 'user' | 'model'; text: string }[];
  /** The tools the model has called, newest last. */
  calls: { at: number; name: string; input: string }[];
}

/** Nothing has happened yet. */
const IDLE: BrainStatus = { state: 'sleeping', transcript: [], calls: [] };

/** A running session, and the one way to put words into it. */
export interface Brain extends BrainStatus {
  /**
   * Whether the character is talking right now, hangover included.
   *
   * @returns True while sound is going out of the speaker. Fusion reads it so
   * that noticing something mid-sentence does not cut the sentence off.
   */
  speaking(): boolean;
  /**
   * Who has the floor right now.
   *
   * @returns The holder. Fusion reads it, because text put into the session
   * while the person is talking or an answer is being made costs them the answer.
   */
  floor(): FloorHolder;
  /**
   * Where the eyes' own sounds are played.
   *
   * @returns The voice's output, or null while no session has a voice running.
   * The sounds share his voice's sink so the echo canceller hears them too.
   */
  foley(): FoleyOutput | null;
  /**
   * Put a line into the session by hand.
   *
   * @remarks
   * Section 12 asks for the brain to be testable without sitting in front of
   * the camera. This is that: the same two calls fusion makes, driven from the
   * debug panel instead.
   *
   * @param text - The line, usually starting `[idle]`.
   * @param answer - True asks for a reply, false leaves it silently in context.
   */
  say(text: string, answer: boolean): void;
}

/** How many lines of transcript and how many calls the panel keeps. */
const KEPT = 60;

/** How long to wait before reopening a session that dropped. */
const RETRY_MS = 2500;

/** How many times the wait doubles before it stops growing. */
const MAX_BACKOFF = 4;

/**
 * How long to wait before reopening.
 *
 * @remarks
 * A live session ends on its own eventually, on a context limit or a network
 * blip, and the character should come back rather than go quiet. Backing off
 * keeps a server that is down from being hammered by a tab left open.
 *
 * @param attempt - How many times it has already tried.
 * @returns The wait, in milliseconds.
 */
function backoff(attempt: number): number {
  return RETRY_MS * 2 ** Math.min(attempt, MAX_BACKOFF);
}

/** What the session is fed from outside itself. */
export interface Feeds {
  /** Where his voice levels are published, for the eyes to move with. */
  bus: Bus;
  /** The camera the vision sense has open, or null. He is shown frames of it. */
  stream: MediaStream | null;
  /** True when the person has muted the microphone. The session stays open. */
  muted: boolean;
  /** True while the person holds the talk button. Read only when the button marks the turns. */
  talking: boolean;
  /** The tools that answer from what the browser knows. */
  local: LocalTools;
}

/**
 * The two questions the rest of the app asks about the conversation.
 *
 * @param player - The voice, once it has started.
 * @param floor - Who has the floor.
 * @returns `speaking`, `floor` and `foley`, as {@link Brain} describes them.
 */
function useWhoIsTalking(player: RefObject<Voice | null>, floor: Floor) {
  const speaking = useCallback(() => player.current?.speaking() ?? false, [player]);
  const holder = useCallback(() => floor.holder(speaking()), [floor, speaking]);
  const foley = useCallback(() => player.current?.foley ?? null, [player]);
  return { speaking, floor: holder, foley };
}

/**
 * Keep the machine effect on the voice at what was asked for.
 *
 * @param player - The voice, once it has started.
 * @param robot - How much machine to put on top, 0 to 1.
 */
function useRobot(player: RefObject<Voice | null>, robot: number): void {
  useEffect(() => {
    player.current?.setRobot(robot);
  }, [player, robot]);
}

/** What else the session opens with, apart from the voice and the setup. */
export interface SessionChoice {
  /** Who marks the turns. */
  listening: Listening;
  /** The masked Gemini key and the live model. */
  upstream: string;
}

/**
 * What the session opens with, stable until one of its parts changes.
 *
 * @param voice - Which of the model's voices he speaks with.
 * @param who - The language and the name from the setup screen.
 * @param choice - Who marks the turns, the key and the live model.
 * @returns The same object for the same values, so a parent that builds
 * `who` again on every render does not reopen the session.
 */
function useOpening(voice: VoiceChoice, who: Setup, choice: SessionChoice): Opening {
  const { language, name } = who;
  const { listening, upstream } = choice;
  return useMemo(
    () => ({ voice, who: { language, name }, listening, upstream }),
    [voice, language, name, listening, upstream],
  );
}

/**
 * Open and run a session.
 *
 * @param controls - The eyes, for the model's tools to drive.
 * @param wanted - False closes everything, which is how the debug panel turns
 * the brain off without reloading.
 * @param sound - Which voice, and how much machine on top.
 * @param who - The language and the name from the setup screen. Changing
 * either reopens the session, because both are part of the system instruction.
 * @param choice - Who marks the turns, the key and the live model. Changing
 * any of them reopens the session too.
 * @param feeds - The bus his voice levels go out on, and the camera he is shown.
 * @returns What the session is doing.
 */
export function useBrain(
  controls: EyesControls | null,
  wanted: boolean,
  { voice, robot, halfDuplex }: VoiceSettings,
  who: Setup,
  choice: SessionChoice,
  feeds: Feeds,
): Brain {
  const pending = useRef<Line[]>([]);
  const opening = useOpening(voice, who, choice);
  const shared = useShared(halfDuplex, feeds.bus, feeds.local);
  const { live, player, floor } = shared;
  const status = useSession(wanted && controls ? controls : null, opening, shared);

  useRobot(player, robot);
  useFeeds(status.state, live, feeds);
  useMute(shared, feeds.muted);
  useTalkButton(shared, choice.listening, feeds.talking);
  const say = useSay(status.state, live, pending, floor);

  return { ...status, say, ...useWhoIsTalking(player, floor) };
}

/**
 * Keep a session open for as long as it is wanted, and reopen one that drops.
 *
 * @param controls - The eyes, or null when no session is wanted, which closes
 * everything: that is how the debug panel turns the brain off without reloading.
 * @param opening - What the session opens with. A change reopens it. `robot`
 * and `halfDuplex` are deliberately absent: both are applied to the running
 * session instead.
 * @param shared - What outlives a session.
 * @returns What the session is doing.
 */
function useSession(controls: EyesControls | null, opening: Opening, shared: Shared): BrainStatus {
  const [status, setStatus] = useState<BrainStatus>(IDLE);
  const [attempt, setAttempt] = useState(0);
  const { live } = shared;

  useEffect(() => {
    if (!controls) {
      setStatus(IDLE);
      return;
    }
    let retry: ReturnType<typeof setTimeout> | undefined;
    const reopen = () => {
      setStatus((previous) => ({ ...previous, state: 'reconnecting' }));
      retry = setTimeout(() => {
        setAttempt((count) => count + 1);
      }, backoff(attempt));
    };
    const session = startSession(controls, setStatus, reopen, opening, shared);
    return () => {
      clearTimeout(retry);
      live.current = null;
      void session.then((stop) => stop());
    };
  }, [controls, attempt, opening, shared, live]);

  return status;
}

/**
 * Add a tool call to the ones the inspector shows.
 *
 * @param status - The session so far.
 * @param name - The tool.
 * @param input - Its arguments, as JSON.
 * @returns The session, with the call added and the oldest dropped.
 */
function withCall(status: BrainStatus, name: string, input: string): BrainStatus {
  return { ...status, calls: [...status.calls, { at: Date.now(), name, input }].slice(-KEPT) };
}

/**
 * Add a fragment of transcript to the conversation.
 *
 * @remarks
 * Transcripts arrive a few words at a time, so a fragment continues the line
 * before it when the speaker has not changed. Without this a sentence becomes
 * four rows in the inspector. Fragments are stored exactly as they arrive; the
 * transcriber's own markers are split across them and can only be removed once
 * the line is whole, which is the inspector's job.
 *
 * @param lines - The conversation so far.
 * @param role - Who is speaking.
 * @param text - The fragment.
 * @returns The conversation, with the fragment merged in.
 */
function addTranscript(
  lines: BrainStatus['transcript'],
  role: 'user' | 'model',
  text: string,
): BrainStatus['transcript'] {
  const last = lines.at(-1);
  if (last?.role === role) {
    return [...lines.slice(0, -1), { ...last, text: last.text + text }];
  }
  return [...lines, { seq: (last?.seq ?? 0) + 1, role, text }].slice(-KEPT);
}

/** How the character should sound. */
export interface VoiceSettings {
  /** Which of the model's voices it speaks with. Changing it reopens the session. */
  voice: VoiceChoice;
  /** How much machine to put on top, 0 to 1. Changes take effect at once. */
  robot: number;
  /**
   * Hold the microphone for as long as the character is speaking, rather than
   * only until the echo canceller has converged.
   *
   * @remarks
   * The canceller can only subtract what it can hear cleanly, and on some
   * machines and in some rooms it never gets there: the character's own voice
   * leaks back, the model's voice activity detector reads it as somebody
   * talking over it, and it interrupts itself. This trades barging in by voice
   * for never doing that.
   */
  halfDuplex: boolean;
}

/** Where the session reports what it is doing. */
type Report = (update: (previous: BrainStatus) => BrainStatus) => void;

/** The pieces one session owns, filled in as each starts. */
interface Pieces {
  /** The character's voice. */
  voice: Voice | null;
  /** The microphone, or null when it would not open. */
  microphone: Microphone | null;
  /** Who has the floor, told about everything heard and said. */
  floor: Floor;
  /** The look that shows he is listening. */
  attention: Attention;
  /** Publishes how both voices sound, for the eyes to move with. */
  levels: VoiceLevels;
  /** The tools that answer from what the browser knows. */
  local: LocalTools;
}

/**
 * Keep the floor and the listening behaviour up to date with the conversation.
 *
 * @param pieces - Where both of them live.
 * @param from - `user` when a fragment of their speech arrived, `model` when
 * his answer started to.
 */
function noteTurn(pieces: Pieces, from: 'user' | 'model'): void {
  if (from === 'user') {
    pieces.floor.heard();
    pieces.attention.heard();
    return;
  }
  pieces.floor.answered();
}

/**
 * Build the handlers that connect the socket to the eyes, the voice and the
 * panel.
 *
 * @param controls - The eyes.
 * @param pieces - The voice, read at call time because it starts after this.
 * @param report - Where the status goes.
 * @param answer - Answers a tool call, which is what unblocks speech.
 * @returns The handlers.
 */
function handlers(
  controls: EyesControls,
  pieces: Pieces,
  report: Report,
  answer: (callId: string, ok: boolean, answer?: string) => void,
) {
  return {
    onState: (message: SessionState) => {
      report((previous) => ({
        ...previous,
        state: message.state,
        ...(message.detail === undefined ? {} : { detail: message.detail }),
      }));
    },
    onAudio: (pcm: ArrayBuffer) => {
      noteTurn(pieces, 'model');
      pieces.voice?.play(pcm);
    },
    onInterrupted: () => {
      pieces.voice?.clear();
    },
    onTranscript: (role: 'user' | 'model', text: string) => {
      if (role === 'user') noteTurn(pieces, 'user');
      report((previous) => ({
        ...previous,
        transcript: addTranscript(previous.transcript, role, text),
      }));
    },
    onToolCall: (callId: string, input: ToolInput) => {
      const said = dispatchTool(controls, pieces.local, input);
      // Answered at once, whatever it was: section 7.3 is explicit that a slow
      // hand must never stall speech, and the spike confirmed the turn hangs
      // until this arrives.
      answer(callId, true, said);
      report((previous) => withCall(previous, input.name, JSON.stringify(input)));
    },
    onToolRan: (name: string, input: string) => {
      report((previous) => withCall(previous, name, input));
    },
  };
}

/**
 * Build what one session owns, before anything has started.
 *
 * @param controls - The eyes, for the listening behaviour.
 * @param shared - Supplies the floor and the bus.
 * @returns The pieces, with the voice and the microphone still to come.
 */
function makePieces(controls: EyesControls, shared: Shared): Pieces {
  const pieces: Pieces = {
    voice: null,
    microphone: null,
    floor: shared.floor,
    attention: createAttention(controls),
    levels: startVoiceLevels(shared.bus, () => pieces.voice),
    // Read through the ref at call time, so a session opened before the
    // recogniser was switched on still answers with what it knows now.
    local: {
      whoIsHere: () => shared.local.current.whoIsHere(),
      nameFace: (name) => shared.local.current.nameFace(name),
    },
  };
  return pieces;
}

/**
 * Wire the socket, the microphone and the voice together.
 *
 * @param controls - The eyes.
 * @param report - Where the status goes.
 * @param onLost - Called once when the session ends by itself, not on teardown.
 * @param opening - The voice, the language and the name to open with.
 * @param shared - What outlives this session: the refs, the floor and the bus.
 * @returns A function that tears the whole session down.
 */
async function startSession(
  controls: EyesControls,
  report: Report,
  onLost: () => void,
  opening: Opening,
  shared: Shared,
): Promise<() => void> {
  const { live, player } = shared;
  const pieces = makePieces(controls, shared);
  const ended = { closed: false };
  const client: BrainClient = connectBrain(
    {
      ...handlers(controls, pieces, report, (callId, ok, said) => {
        client.answer(callId, ok, said);
      }),
      onClosed: () => {
        if (ended.closed) return;
        ended.closed = true;
        onLost();
      },
    },
    opening,
  );
  live.current = client;

  pieces.voice = await startVoice();
  player.current = pieces.voice;
  await wireMicrophone(shared, client, pieces, report, opening.listening);

  return () => {
    ended.closed = true;
    shared.setMic.current = null;
    pieces.levels.stop();
    player.current = null;
    client.stop();
    void pieces.microphone?.stop();
    void pieces.voice?.stop();
  };
}

/**
 * Give the session a microphone it can open and release, and open it unless
 * the person has already muted.
 *
 * @param shared - Where the switch is left for {@link useMute}, and whether it is muted now.
 * @param client - Where the frames go.
 * @param pieces - Holds the microphone.
 * @param report - Where a refusal is reported.
 * @param listening - Who marks the turns, fixed for the life of the session.
 */
async function wireMicrophone(
  shared: Shared,
  client: BrainClient,
  pieces: Pieces,
  report: Report,
  listening: Listening,
): Promise<void> {
  // Read per frame, so flipping a switch takes effect on the next frame
  // rather than by reopening the microphone.
  const held = () =>
    heldFrame({
      listening,
      talking: shared.talking.current,
      voice: pieces.voice,
      halfDuplex: shared.halfDuplex.current,
    });
  const setMic = (muted: boolean) =>
    muted ? closeMicrophone(pieces) : openMicrophone(client, pieces, report, held);
  shared.setMic.current = (muted) => void setMic(muted);
  await setMic(shared.muted.current);
}

/**
 * Release the microphone, which turns the browser's indicator off.
 *
 * @param pieces - Holds the microphone.
 */
async function closeMicrophone(pieces: Pieces): Promise<void> {
  const microphone = pieces.microphone;
  pieces.microphone = null;
  await microphone?.stop();
}

/**
 * Open the microphone, gated so the character does not hear itself, or hears
 * only the person with the button.
 *
 * @param client - Where the frames go.
 * @param pieces - Holds the microphone.
 * @param report - Where a refusal is reported, since the session carries on
 * without one: it can still speak, it just cannot hear.
 * @param held - Whether the frame arriving now is replaced with silence.
 */
async function openMicrophone(
  client: BrainClient,
  pieces: Pieces,
  report: Report,
  held: () => boolean,
): Promise<void> {
  if (pieces.microphone) return;
  try {
    pieces.microphone = await startMicrophone((pcm) => {
      const sent = held() ? new ArrayBuffer(pcm.byteLength) : pcm;
      pieces.levels.heard(sent);
      client.sendAudio(sent);
    });
  } catch (error) {
    const detail = error instanceof MicError ? error.message : String(error);
    report((previous) => ({ ...previous, state: 'failed', detail }));
  }
}
