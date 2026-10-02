/**
 * The loop. One `requestAnimationFrame` owns every animated value in the
 * character: it composes the emotion, the gaze, the gesture and the brainstem
 * into one pose, steps fourteen springs, and writes the result to the SVG.
 *
 * Nothing here is React state, and nothing here waits on anything.
 */
import type { Emotion, GazeTarget, GestureKind } from '@m8/shared';
import { type Brainstem, createBrainstem } from './brainstem.ts';
import { emotionTargets, fadedIntensity } from './emotions.ts';
import { applyFlourishes, type FlourishHandles } from './flourish-writer.ts';
import { createFlourishes, type Flourishes, type FlourishSwitches } from './flourishes.ts';
import type { GazeArbiter, GazePriority } from './gaze-arbiter.ts';
import { GESTURES } from './gestures.ts';
import { createSeededRandom, newSeed } from './random.ts';
import {
  clampRigValue,
  RIG_PARAM_NAMES,
  RIG_REST,
  type RigParamName,
  type RigParams,
  rigSpring,
} from './rig.ts';
import { applyRig, type RigHandles } from './rig-writer.ts';
import { restingSpring, type SpringState, stepSpring } from './spring.ts';
import type { VoiceMotion } from './voice-motion.ts';

/**
 * The three functions the model's client-side tools call. This is the whole
 * public surface of the eyes: everything else in this folder is private, and
 * the tool dispatcher is wired straight to an object of this shape.
 */
export interface EyesControls {
  /**
   * Point the eyes at something. Targets are semantic: the arbiter resolves the
   * name against what the senses last saw, so the model never handles
   * coordinates and a target stays valid while the thing it names moves.
   * @param target - Which of the seven.
   * @param holdMs - How long to hold it. Defaults to two seconds.
   */
  lookAt(target: GazeTarget, holdMs?: number): void;
  /**
   * Change the expression.
   * @param emotion - Which one.
   * @param intensity - 0 to 1. Defaults to 0.6.
   */
  setEmotion(emotion: Emotion, intensity?: number): void;
  /**
   * Play a one-shot animation over the current expression.
   * @param kind - Which gesture. A second call restarts it.
   */
  gesture(kind: GestureKind): void;
}

/** The seam the debug panel reaches through. Not part of the character's API. */
export interface EyesInspector {
  /** The pose as last drawn. */
  pose(): RigParams;
  /** The expression currently held. */
  expression(): { emotion: Emotion; intensity: number };
  /** Which flourishes are switched on. */
  flourishes(): FlourishSwitches;
  /**
   * Switch flourishes on and off. With all of them off the face is plain.
   * @param switches - Which ones are on.
   */
  setFlourishes(switches: FlourishSwitches): void;
  /** The gesture playing right now, or `null`. The foley plays a sound as one starts. */
  playingGesture(): GestureKind | null;
  /**
   * Pin a parameter, bypassing its spring.
   * @param name - Which parameter.
   * @param value - The value, or `null` to release it.
   */
  override(name: RigParamName, value: number | null): void;
  /** Which parameters are currently pinned. */
  overrides(): Partial<RigParams>;
  /**
   * Stop the autonomous behaviour so the rig can be read on its own.
   * @param frozen - True to freeze.
   */
  freezeBrainstem(frozen: boolean): void;
  /** Whether the brainstem is frozen. */
  isBrainstemFrozen(): boolean;
  /** The seed the brainstem is running on, for the recorder to store. */
  seed(): number;
  /** Which claim is winning the gaze, or `null` while the eyes wander. */
  gaze(): GazePriority | null;
}

/** A running rig. */
export interface EyesController {
  /** What the tools call. */
  controls: EyesControls;
  /** What the debug panel calls. */
  inspector: EyesInspector;
  /** Cancel the loop and release the gaze source. */
  stop(): void;
}

/** How the controller is wired up. */
export interface ControllerOptions {
  /** The SVG elements to drive. */
  handles: RigHandles;
  /** Decides where to look, out of the reflexes, the model and idle wandering. */
  arbiter: GazeArbiter;
  /**
   * The small motion that follows his voice and the person's. Optional, so a
   * rig without one is exactly the rig it was before.
   */
  voiceMotion?: VoiceMotion;
  /**
   * The elements the flourishes are drawn with. Null or absent leaves the rig
   * exactly as it was before there were any.
   */
  flourishes?: FlourishHandles | null;
  /** Honour `prefers-reduced-motion`. Defaults to reading the media query. */
  reducedMotion?: boolean;
  /**
   * Seeds the brainstem. Defaults to a fresh one. A replay passes the seed the
   * recording was made with, which is what makes the eyes repeat exactly.
   */
  seed?: number;
}

/** Mixed into the seed for the flourishes' own random stream. Any constant works. */
const FLOURISH_SEED = 0x51f15e;

/** Default hold for {@link EyesControls.lookAt}, matching the `look_at` tool. */
const DEFAULT_HOLD_MS = 2000;

/**
 * A gesture in flight. It ages on the frame clock, never on a timestamp taken
 * at the call: a tool call can land between a vsync and its frame, and a start
 * later than the frame's own time gave a negative progress and a NaN pose.
 */
interface PlayingGesture {
  /** Which one. */
  kind: GestureKind;
  /** How long it has been playing, in milliseconds of frame time. */
  elapsedMs: number;
}

/** The expression as the model set it, and how long ago. */
interface HeldExpression {
  /** Which one. */
  emotion: Emotion;
  /** The intensity it was set with, before the fade. */
  intensity: number;
  /** Seconds of frame time since it was set. */
  age: number;
}

/**
 * The rig. It implements both public surfaces, and the factory below hands each
 * caller only the one it is entitled to.
 */
class EyesRig implements EyesControls, EyesInspector {
  readonly #handles: RigHandles;
  readonly #arbiter: GazeArbiter;
  readonly #voiceMotion: VoiceMotion | null;
  readonly #flourishHandles: FlourishHandles | null;
  readonly #flourishes: Flourishes;
  readonly #brainstem: Brainstem;
  readonly #seed: number;
  readonly #reducedMotion: boolean;
  readonly #springs = new Map<RigParamName, SpringState>();
  readonly #overrides = new Map<RigParamName, number>();
  #held: HeldExpression = { emotion: 'neutral', intensity: 0, age: 0 };
  #expression: { emotion: Emotion; intensity: number } = { emotion: 'neutral', intensity: 0 };
  #emotionPose = emotionTargets('neutral', 0);
  #playing: PlayingGesture | null = null;
  #pose: RigParams = { ...RIG_REST };
  #lastFrame = 0;
  #frame = 0;
  /** The loop's callback, bound once so re-arming costs no allocation. */
  readonly #onFrame = (now: number): void => {
    this.#tick(now);
  };

  /** @param options - The elements to drive, and what drives them. */
  constructor(options: ControllerOptions) {
    this.#handles = options.handles;
    this.#reducedMotion = options.reducedMotion ?? prefersReducedMotion();
    this.#arbiter = options.arbiter;
    // Reduced motion turns the voice motion off: it is decoration, and it is constant.
    this.#voiceMotion = this.#reducedMotion ? null : (options.voiceMotion ?? null);
    this.#seed = options.seed ?? newSeed();
    this.#flourishHandles = options.flourishes ?? null;
    this.#flourishes = createFlourishes({
      reducedMotion: this.#reducedMotion,
      // Its own stream, so the brainstem draws exactly the numbers it always did.
      random: createSeededRandom(this.#seed ^ FLOURISH_SEED),
    });
    this.#brainstem = createBrainstem({
      reducedMotion: this.#reducedMotion,
      random: createSeededRandom(this.#seed),
    });
    for (const name of RIG_PARAM_NAMES) this.#springs.set(name, restingSpring(RIG_REST[name]));
  }

  /** Begin animating. */
  start(): void {
    this.#frame = requestAnimationFrame(this.#onFrame);
  }

  /** Cancel the loop and release the arbiter. */
  stop(): void {
    cancelAnimationFrame(this.#frame);
    this.#arbiter.stop();
    this.#voiceMotion?.stop();
  }

  lookAt(target: GazeTarget, holdMs = DEFAULT_HOLD_MS): void {
    // The model is one claimant among three. A reflex glance still beats it.
    this.#arbiter.look(target, holdMs);
  }

  setEmotion(emotion: Emotion, intensity = 0.6): void {
    this.#held = { emotion, intensity, age: 0 };
    this.#holdExpression();
  }

  gesture(kind: GestureKind): void {
    this.#playing = { kind, elapsedMs: 0 };
  }

  pose(): RigParams {
    return { ...this.#pose };
  }

  flourishes(): FlourishSwitches {
    return this.#flourishes.switches();
  }

  setFlourishes(switches: FlourishSwitches): void {
    this.#flourishes.setSwitches(switches);
  }

  playingGesture(): GestureKind | null {
    return this.#playing?.kind ?? null;
  }

  expression(): { emotion: Emotion; intensity: number } {
    return { ...this.#expression };
  }

  override(name: RigParamName, value: number | null): void {
    if (value === null) this.#overrides.delete(name);
    else this.#overrides.set(name, clampRigValue(name, value));
  }

  overrides(): Partial<RigParams> {
    return Object.fromEntries(this.#overrides) as Partial<RigParams>;
  }

  freezeBrainstem(frozen: boolean): void {
    this.#brainstem.setFrozen(frozen);
  }

  isBrainstemFrozen(): boolean {
    return this.#brainstem.isFrozen();
  }

  seed(): number {
    return this.#seed;
  }

  gaze(): GazePriority | null {
    return this.#arbiter.winner();
  }

  /**
   * Let the held expression age, and pull the pose toward what is left of it.
   * Changing the target is the blend: the springs are already somewhere
   * between the old pose and the new one.
   * @param deltaSeconds - Time since the last frame. Zero recomputes in place.
   */
  #holdExpression(deltaSeconds = 0): void {
    this.#held.age += deltaSeconds;
    const { emotion, intensity, age } = this.#held;
    const faded = fadedIntensity(emotion, intensity, age);
    if (faded === this.#expression.intensity && emotion === this.#expression.emotion) return;
    this.#expression = { emotion, intensity: faded };
    this.#emotionPose = emotionTargets(emotion, faded);
  }

  /**
   * The playing gesture's contribution.
   * @param deltaSeconds - Time since the last frame.
   * @returns The offsets to add, empty when nothing is playing.
   */
  #gestureOffsets(deltaSeconds: number): Partial<RigParams> {
    if (!this.#playing) return {};
    const gesture = GESTURES[this.#playing.kind];
    this.#playing.elapsedMs += deltaSeconds * 1000;
    const progress = this.#playing.elapsedMs / gesture.durationMs;
    if (progress >= 1) {
      this.#playing = null;
      return {};
    }
    return gesture.frame(Math.max(0, progress));
  }

  /**
   * Compose one frame's targets from every source that has an opinion.
   * @param deltaSeconds - Time since the last frame.
   * @returns The pose the springs are pulled toward.
   */
  #composeTargets(deltaSeconds: number): RigParams {
    const look = this.#arbiter.read();
    const drive = this.#brainstem.step(deltaSeconds, this.#pose, look === null);
    this.#holdExpression(deltaSeconds);
    const offsets = this.#gestureOffsets(deltaSeconds);
    const voice = this.#voiceMotion?.offsets() ?? {};
    const targets = { ...this.#emotionPose };

    targets.gazeX += (look?.x ?? 0) + drive.gazeX;
    targets.gazeY += (look?.y ?? 0) + drive.gazeY;
    targets.leftUpperLid += drive.upperLid;
    targets.rightUpperLid += drive.upperLid;
    targets.leftLowerLid += drive.lowerLid;
    targets.rightLowerLid += drive.lowerLid;
    targets.leftPupil += drive.pupil;
    targets.rightPupil += drive.pupil;

    for (const name of RIG_PARAM_NAMES) {
      const added = (offsets[name] ?? 0) + (voice[name] ?? 0);
      targets[name] = clampRigValue(name, targets[name] + added);
    }
    return targets;
  }

  /**
   * Advance one parameter and store its spring.
   * @param name - Which parameter.
   * @param target - Where it is pulled.
   * @param deltaSeconds - Time since the last frame.
   * @returns The parameter's new value, clamped. A pinned parameter ignores all
   * three arguments and stays where the debug panel put it.
   */
  #stepOne(name: RigParamName, target: number, deltaSeconds: number): number {
    const pinned = this.#overrides.get(name);
    if (pinned !== undefined) {
      this.#springs.set(name, restingSpring(pinned));
      return pinned;
    }
    const current = this.#springs.get(name) ?? restingSpring(RIG_REST[name]);
    const stepped = stepSpring(current, target, rigSpring(name, this.#reducedMotion), deltaSeconds);
    this.#springs.set(name, stepped);
    return clampRigValue(name, stepped.value);
  }

  /**
   * One frame: compose, step, draw.
   * @param now - The frame's timestamp, from `requestAnimationFrame`.
   */
  #tick(now: number): void {
    this.#frame = requestAnimationFrame(this.#onFrame);
    const deltaSeconds = this.#lastFrame === 0 ? 1 / 60 : (now - this.#lastFrame) / 1000;
    this.#lastFrame = now;

    const targets = this.#composeTargets(deltaSeconds);
    const next = { ...this.#pose };
    for (const name of RIG_PARAM_NAMES) {
      next[name] = this.#stepOne(name, targets[name], deltaSeconds);
    }

    this.#pose = next;
    applyRig(this.#handles, this.#pose);
    if (!this.#flourishHandles) return;
    const state = this.#flourishes.step(deltaSeconds, this.#expression);
    applyFlourishes(this.#flourishHandles, this.#handles, state, this.#pose);
  }
}

/**
 * Whether the user asked for less movement.
 *
 * @returns True when `prefers-reduced-motion: reduce` is set.
 */
function prefersReducedMotion(): boolean {
  return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

/**
 * Start the rig.
 *
 * @param options - The elements to drive, and what drives them.
 * @returns The running controller. `controls` and `inspector` are the same
 * object seen through two interfaces, which is what keeps the tool surface to
 * three functions.
 */
export function createEyesController(options: ControllerOptions): EyesController {
  const rig = new EyesRig(options);
  rig.start();
  return {
    controls: rig,
    inspector: rig,
    stop: () => {
      rig.stop();
    },
  };
}
