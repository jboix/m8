/**
 * The layer that decides when the character starts something by itself.
 *
 * The model sees and hears for itself, so nothing here describes the
 * world to it any more. Every event is still weighed and charge still
 * accumulates, but the only question left is whether he is bored enough, and
 * the moment quiet enough, to speak without being spoken to. When it is, one
 * `[idle]` line goes into the session. Otherwise nothing does.
 *
 * Section 11: this is one of only two modules allowed to send `senses.*`.
 */

import { createSalience, type Salience } from '@m8/salience';
import type { Mood, SenseEvent } from '@m8/shared';
import type { FloorHolder } from '../brain/floor.ts';
import type { Bus } from '../bus/bus.ts';
import { createMood, type MoodTracker } from '../mood/mood.ts';
import { type CompanyNote, createCompanyNote } from './company-note.ts';
import { createImpatience, type Impatience } from './impatience.ts';
import { createMissing, type Missing } from './missing.ts';
import { toIdleLine, withClock } from './templates.ts';
import { weigh } from './weights.ts';

/** How often the loop runs. Slow enough to be free, fast enough to feel prompt. */
const TICK_MS = 100;

/** How far above the threshold a fire has to be to be worth speaking up about. */
const WORTH_SAYING_OVER = 1.45;

/**
 * How long the floor has to have been free before he may start something.
 *
 * @remarks
 * Text put into the session ends the generation in progress. A pause for
 * thought is not an invitation, and neither is the second after he stops
 * talking: the person may be about to answer.
 */
const QUIET_SECONDS = 6;

/** How often his mood goes out on the bus, for the session's log to end with. */
const MOOD_REPORT_SECONDS = 15;

/** The least time between two idle lines, whatever prompted them. */
const IDLE_GAP_SECONDS = 20;

/**
 * What became of a fire.
 *
 * - `said`: an idle line went into the session.
 * - `dropped`: it was not the moment, or not enough. Nothing is kept for later,
 *   because remarking on a wave from a minute ago is worse than not remarking.
 */
export type Outcome = 'said' | 'dropped';

/**
 * Decide whether a fire may become an idle line.
 *
 * @param voltage - What it fired at.
 * @param threshold - What it took.
 * @param quiet - How long the floor has been free, in seconds.
 * @param sinceIdle - How long since the last idle line, in seconds.
 * @returns `said` only when it is big enough, nobody has had the floor for a
 * while, and he has not just spoken up.
 */
export function decideOutcome(
  voltage: number,
  threshold: number,
  quiet: number,
  sinceIdle: number,
): Outcome {
  const worthSaying = voltage >= threshold * WORTH_SAYING_OVER;
  const moment = quiet >= QUIET_SECONDS && sinceIdle >= IDLE_GAP_SECONDS;
  return worthSaying && moment ? 'said' : 'dropped';
}

/** How many recent events are kept to explain a fire. */
const RECENT = 12;

/** What fusion reports for the debug panel. */
export interface FusionState {
  /** The filter's charge now. */
  voltage: number;
  /** What it currently takes to fire. */
  threshold: number;
  /** How the character is feeling. */
  mood: Mood;
  /** The last few outcomes, newest last. */
  fires: { at: number; outcome: Outcome; text: string }[];
  /** How long the floor has been free, in seconds. Zero while anybody has it. */
  quiet: number;
}

/** How fusion is wired. */
export interface FusionOptions {
  /** Where the events arrive, and where `salience.fired` goes back out. */
  bus: Bus;
  /**
   * Puts a line into the live session.
   * @param text - The `[idle]` line.
   * @param answer - Always true here: an idle line is there to make him speak.
   */
  say: (text: string, answer: boolean) => void;
  /** Who has the floor right now. Nothing is sent unless it has been free a while. */
  floor: () => FloorHolder;
  /** Called on every tick with what to show. */
  onState: (state: FusionState) => void;
}

/** A running fusion. */
export interface Fusion {
  /** Stop listening and stop ticking. */
  stop(): void;
}

/** Everything one run of fusion owns. */
interface Parts {
  salience: Salience;
  mood: MoodTracker;
  impatience: Impatience;
  missing: Missing;
  company: CompanyNote;
  recent: SenseEvent[];
  present: boolean;
  fires: FusionState['fires'];
  /** How long the floor has been free, in seconds. */
  quiet: number;
  /** How long since the last idle line, in seconds. */
  sinceIdle: number;
  /** How long since his mood last went out on the bus, in seconds. */
  sinceMood: number;
}

/**
 * Take one event in.
 *
 * @param parts - What fusion owns. Mutated in place.
 * @param event - What happened.
 */
function absorb(parts: Parts, event: SenseEvent): void {
  if (event.type === 'presence') parts.present = event.state === 'present';
  parts.missing.absorb(event);
  parts.company.absorb(event);
  const stimulus = weigh(event);
  if (!stimulus) return;

  parts.salience.stimulate(stimulus.key, stimulus.weight);
  parts.recent = [event, ...parts.recent].slice(0, RECENT);
  // Anything at all is a reason to stop being bored. Arousal deliberately does
  // not move here: motion arrives twelve times a second, and letting every
  // frame wind the character up pins arousal at its ceiling, which raises the
  // threshold until nothing can ever cross it. It is what the character reacted
  // to that should wind it up, not what reached its eyes.
  parts.mood.nudge({ boredom: -stimulus.weight * 0.3 });
  if (event.type === 'vision.expression' && event.kind === 'smile') {
    parts.mood.nudge({ valence: 0.12 });
  }
}

/**
 * Put one idle line into the session and remember that it went.
 *
 * @param parts - What fusion owns. Mutated in place.
 * @param text - The line.
 * @param options - Where it goes.
 */
function startSomething(parts: Parts, text: string, options: FusionOptions): void {
  options.say(withClock(text, new Date()), true);
  parts.sinceIdle = 0;
  parts.impatience.spoke();
}

/**
 * Decide what to do about a fire, and do it.
 *
 * @param parts - What fusion owns.
 * @param voltage - The charge it fired at.
 * @param threshold - What it took.
 * @param causes - The stimulus keys behind it.
 * @param options - Where the line goes.
 */
function react(
  parts: Parts,
  voltage: number,
  threshold: number,
  causes: string[],
  options: FusionOptions,
): void {
  const behind = parts.recent.filter((event) =>
    causes.some((cause) => cause.startsWith(event.type)),
  );
  const text = toIdleLine(behind.length > 0 ? behind : parts.recent);
  const outcome = decideOutcome(voltage, threshold, parts.quiet, parts.sinceIdle);
  options.bus.publish({
    type: 'salience.fired',
    ts: performance.now(),
    voltage,
    causes,
    outcome: outcome === 'said' ? 'interrupt' : 'note',
  });
  if (outcome === 'said') startSomething(parts, text, options);
  parts.fires = [...parts.fires, { at: Date.now(), outcome, text }].slice(-RECENT);
  parts.recent = [];
}

/**
 * Let the clocks run. Both stop while anybody has the floor.
 *
 * @param parts - What fusion owns. Mutated in place.
 * @param seconds - How much time passed.
 * @param floor - Who has the floor.
 */
function passTime(parts: Parts, seconds: number, floor: FloorHolder): void {
  parts.sinceIdle += seconds;
  parts.quiet = floor === 'free' ? parts.quiet + seconds : 0;
  // Somebody talking to him is not ignoring him, so boredom starts over. His
  // own voice does not count: an idle line he just said is not an answer to it.
  if (floor === 'theirs') parts.impatience.reset();
}

/**
 * Put his mood on the bus every so often.
 *
 * @param parts - What fusion owns. Mutated in place.
 * @param seconds - How much time passed.
 * @param bus - Where it goes.
 */
function reportMood(parts: Parts, seconds: number, bus: Bus): void {
  parts.sinceMood += seconds;
  if (parts.sinceMood < MOOD_REPORT_SECONDS) return;
  parts.sinceMood = 0;
  bus.publish({ type: 'mood', ts: performance.now(), mood: parts.mood.mood() });
}

/**
 * One turn of the loop: let time pass, see whether anything fired, and see
 * whether the silence has gone on long enough to be worth breaking.
 *
 * @param parts - What fusion owns.
 * @param options - Where the lines and the state go.
 */
function tick(parts: Parts, options: FusionOptions): void {
  const seconds = TICK_MS / 1000;
  const floor = options.floor();
  passTime(parts, seconds, floor);
  // A conversation is not silence, so boredom stops climbing while anybody has
  // the floor. Without this it rises while he talks and lowers the threshold.
  parts.mood.step(seconds, floor !== 'free');
  const threshold = parts.mood.threshold();

  const fire = parts.salience.step(seconds, threshold);
  if (fire) react(parts, fire.voltage, threshold, fire.causes, options);

  // Plain boredom: nothing fired, but the quiet has gone on long enough.
  const free = parts.quiet >= QUIET_SECONDS && parts.sinceIdle >= IDLE_GAP_SECONDS;
  const bored = free ? parts.impatience.step(seconds, parts.present) : null;
  if (bored) startSomething(parts, bored, options);

  // Somebody has just gone: ask where, once his own sentence is finished.
  const missed = parts.missing.step(parts.quiet);
  if (missed) startSomething(parts, missed, options);
  // Who is here changed: a note, with no reply asked for.
  const company = parts.company.step(seconds, parts.quiet);
  if (company) options.say(company, false);
  reportMood(parts, seconds, options.bus);

  options.onState({
    voltage: parts.salience.voltage(),
    threshold,
    mood: parts.mood.mood(),
    fires: parts.fires,
    quiet: parts.quiet,
  });
}

/**
 * Start fusion.
 *
 * @param options - The bus, the way into the session, and where to report.
 * @returns A handle that stops it.
 */
export function startFusion(options: FusionOptions): Fusion {
  const parts: Parts = {
    salience: createSalience(),
    mood: createMood(),
    impatience: createImpatience(),
    missing: createMissing(),
    company: createCompanyNote(),
    recent: [],
    present: false,
    fires: [],
    quiet: 0,
    sinceIdle: IDLE_GAP_SECONDS,
    sinceMood: 0,
  };

  const off = options.bus.subscribe((event) => {
    absorb(parts, event);
  });

  const timer = setInterval(() => {
    tick(parts, options);
  }, TICK_MS);

  return {
    stop() {
      off();
      clearInterval(timer);
    },
  };
}
