/**
 * Turning a second of classifier scores into something worth saying.
 *
 * The classifier runs about once a second and reports the same thing every
 * time: music that has been playing for ten minutes is still music. Events are
 * for changes, so this is where a continuous stream of scores becomes onsets.
 */
import type { SenseEvent } from '@m8/shared';
import { groupOf, isSpeech } from './sound-labels.ts';
import type { AmbientWindow } from './windows.ts';

/** One thing the classifier thought it heard. */
export interface Heard {
  /** The AudioSet class name. */
  label: string;
  /** How sure it was, 0 to 1. */
  score: number;
}

/** Below this the classifier is guessing, and it guesses constantly. */
const SCORE_FLOOR = 0.45;

/**
 * How long a sound has to be gone before starting again counts as new.
 *
 * Shorter than it sounds: music dips below the floor between tracks and across
 * a quiet passage, and re-announcing it every time is exactly the behaviour
 * habituation exists to avoid. Habituation would catch it anyway; this keeps it
 * off the bus in the first place so the debug timeline stays readable.
 */
const AGAIN_AFTER_MS = 12_000;

/**
 * How far above the second before it a window has to be to count as a bang.
 *
 * Against the window before it, not against a running average of the room. A
 * running average is wrong here: something that gets suddenly loud and stays
 * loud sits above the average for as long as the average takes to catch up, and
 * reads as one bang after another. Against the previous second, a door slam is
 * a bang and music is a bang only in its first second, which is also when the
 * classifier is calling it music.
 */
const LOUD_OVER_DB = 18;

/** And how loud in absolute terms, so a bang in a silent room is still a bang. */
const LOUD_FLOOR_DB = -34;

/** No second bang inside this, or one door closing is three events. */
const BANG_REFRACTORY_MS = 1800;

/** What the last few seconds sounded like. */
export interface HearingMemory {
  /** Phrase to when it was last reported. */
  said: Map<string, number>;
  /**
   * How loud the window before this one was, or `null` at the very start.
   *
   * The first window is never a bang. There is nothing to have been quieter
   * than, and a page that loads into a room with music already playing should
   * not open by announcing an explosion.
   */
  previous: number | null;
  /** When the last bang was reported. */
  banged: number;
}

/**
 * A fresh memory.
 *
 * @returns Nothing heard, and no idea yet how loud the room is.
 */
export function newHearingMemory(): HearingMemory {
  return { said: new Map(), previous: null, banged: Number.NEGATIVE_INFINITY };
}

/** A sound the character has a word for. */
interface Named {
  /** What it would call it. */
  phrase: string;
  /** How sure the classifier was. */
  score: number;
}

/**
 * The phrase for one classifier result, if it has one.
 *
 * @param one - What the classifier thought it heard.
 * @returns The named sound, or `null` when it is a guess, speech, or one of
 * the several hundred classes not worth a remark.
 */
function name(one: Heard): Named | null {
  if (one.score < SCORE_FLOOR || isSpeech(one.label)) return null;
  const phrase = groupOf(one.label);
  return phrase ? { phrase, score: one.score } : null;
}

/**
 * Pick the single best thing in a window, by group.
 *
 * @param heard - Everything the classifier returned.
 * @returns The phrase and its confidence, or `null` when the window held
 * nothing the character has a word for.
 */
function bestGroup(heard: Heard[]): Named | null {
  let best: Named | null = null;
  for (const one of heard) {
    const named = name(one);
    if (named && (!best || named.score > best.score)) best = named;
  }
  return best;
}

/**
 * Whether this window was a bang, and remember its level either way.
 *
 * @param window - The window, for its level and its time.
 * @param memory - Updated in place.
 * @returns True when it was loud enough, and sudden enough, to be an event.
 */
function isBang(window: AmbientWindow, memory: HearingMemory): boolean {
  const { db, ts } = window;
  const before = memory.previous;
  memory.previous = db;
  if (before === null || db - before < LOUD_OVER_DB || db < LOUD_FLOOR_DB) return false;
  if (ts - memory.banged < BANG_REFRACTORY_MS) return false;
  memory.banged = ts;
  return true;
}

/**
 * What one window is worth telling the rest of the app about.
 *
 * @param window - The audio, for its level and its time.
 * @param heard - What the classifier made of it.
 * @param memory - Carried between windows, and updated in place.
 * @returns Zero, one or two events. A door slam is both a bang and a door, and
 * both are true.
 */
export function deriveSound(
  window: AmbientWindow,
  heard: Heard[],
  memory: HearingMemory,
): SenseEvent[] {
  const events: SenseEvent[] = [];
  if (isBang(window, memory)) {
    events.push({ type: 'sound.loud', ts: window.ts, db: window.db });
  }

  const best = bestGroup(heard);
  if (!best) return events;
  const last = memory.said.get(best.phrase) ?? Number.NEGATIVE_INFINITY;
  memory.said.set(best.phrase, window.ts);
  if (window.ts - last < AGAIN_AFTER_MS) return events;
  events.push({
    type: 'sound.class',
    ts: window.ts,
    label: best.phrase,
    confidence: best.score,
  });
  return events;
}
