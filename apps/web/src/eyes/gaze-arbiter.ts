/**
 * Decides where the character looks, out of everything that has an opinion.
 * Section 8 of docs/architecture.md: a reflex glance beats the model, the model
 * beats a tracked face, and when none of them has anything the eyes wander.
 */
import type { GazeTarget, SenseEvent, SenseEventOf } from '@m8/shared';
import type { Bus, Unsubscribe } from '../bus/bus.ts';

/** A point in the character's field of view. */
export interface GazePoint {
  /** -1 hard left, 0 straight ahead, 1 hard right. */
  x: number;
  /** -1 up, 0 level, 1 down. */
  y: number;
}

/**
 * Who is asking. Listed weakest first, and the order in this array is the
 * priority, so adding a level later means adding it in the right place here and
 * nowhere else.
 */
const PRIORITY = ['track', 'hold', 'glance'] as const;

/** One of the three things that can claim the gaze. */
export type GazePriority = (typeof PRIORITY)[number];

/** The gaze arbiter, which is also the only gaze source the rig ever sees. */
export interface GazeArbiter {
  /**
   * Where to look right now.
   * @returns The winning point, or `null` when nothing is claiming the gaze,
   * which hands the eyes to the brainstem's idle wandering.
   */
  read(): GazePoint | null;
  /**
   * Claim the gaze. Used by the reflexes, and by the model through `look_at`.
   * @param priority - Which level is claiming.
   * @param point - Where to look, or `null` to drop this level's claim.
   * @param forMs - How long the claim lasts.
   */
  claim(priority: GazePriority, point: GazePoint | null, forMs: number): void;
  /**
   * Take the gaze to a semantic target, which is what the model's `look_at`
   * tool asks for. Section 7.3: the model never handles coordinates, and the
   * arbiter resolves the name against what is actually in the room.
   *
   * @param target - Which of the seven.
   * @param forMs - How long to hold it.
   */
  look(target: GazeTarget, forMs: number): void;
  /** The level currently winning, for the debug panel. */
  winner(): GazePriority | null;
  /** Stop listening to the bus. */
  stop(): void;
}

/** How long each kind of claim lasts by default, in milliseconds. */
const LASTS = {
  /** A face keeps the gaze while it keeps arriving, and lets go soon after. */
  track: 1200,
  /** A glance is a flick of attention, not a decision. */
  glance: 750,
} as const;

/** Motion quieter than this is not worth turning the eyes for. */
const MOTION_FLOOR = 0.42;

/**
 * How long after a glance before another one is allowed.
 *
 * @remarks
 * Without this the gaze lives on the motion centroid, because a person in front
 * of a camera generates motion on almost every frame and a glance outranks
 * everything. A reflex that fires continuously is not a reflex. This is only
 * about the gaze: what he says about it goes through the salience filter.
 */
const GLANCE_REFRACTORY_MS = 2200;

/**
 * How near a tracked face motion has to be to count as that face moving.
 *
 * @remarks
 * Measured in gaze units, where the whole field is 2 across. Someone waving
 * their own arm should not pull the eyes off their own head; a door opening
 * behind them should.
 */
const OWN_MOVEMENT = 0.75;

/**
 * How far the character exaggerates where a face is.
 *
 * @remarks
 * Someone at a desk fills the middle third of the frame and never goes near its
 * edges, so tracking their raw position moves the eyes by almost nothing. The
 * mouse spans the whole viewport, which is why following it looks so much more
 * alive. Exaggerating is what a cartoon does, and it is the difference between
 * following a face and looking at someone.
 */
const FACE_GAIN = 2.4;

/**
 * Where the targets that do not depend on the room are.
 *
 * @remarks
 * `speaker`, `nearest_face` and `motion` are missing on purpose: they name
 * something that is actually somewhere, and are resolved against what the
 * senses last reported rather than against a constant.
 */
const FIXED: Partial<Record<GazeTarget, GazePoint>> = {
  away: { x: 0.85, y: -0.15 },
  up_thinking: { x: 0.35, y: -0.8 },
  down: { x: 0, y: 0.75 },
  around: { x: -0.7, y: -0.3 },
};

/** A claim on the gaze, and when it runs out. */
interface Claim {
  point: GazePoint;
  until: number;
}

/**
 * Turn a normalised event position into a gaze point.
 *
 * @param x - 0 to 1 across the field of view, already mirrored.
 * @param y - 0 to 1 down it.
 * @param gain - How far to exaggerate away from centre. 1 maps the frame's
 * edges to the rig's limits; more makes a small movement read as a big one.
 * @returns The same place in the rig's -1 to 1 coordinates, clamped.
 */
function toGazePoint(x: number, y: number, gain = 1): GazePoint {
  return {
    x: Math.max(-1, Math.min(1, (x * 2 - 1) * gain)),
    y: Math.max(-1, Math.min(1, (y * 2 - 1) * gain)),
  };
}

/** Makes a claim on the gaze. The arbiter's own `claim`, handed to the reflexes. */
type Claimant = (priority: GazePriority, point: GazePoint | null, forMs: number) => void;

/** What the reflexes remember between events. */
interface ReflexMemory {
  /** When the last glance fired. */
  glancedAt: number;
  /** Where the followed face is, or `null`. */
  face: GazePoint | null;
  /** The id of the face being followed, or `null`. */
  followed: string | null;
  /** Where every face in view was last seen, by id, unsmoothed. */
  faces: Map<string, GazePoint>;
  /** Where something last moved, or `null`. */
  motion: GazePoint | null;
}

/**
 * Reflexes that have seen nothing yet.
 *
 * @returns The memory.
 */
function newReflexMemory(): ReflexMemory {
  return {
    glancedAt: Number.NEGATIVE_INFINITY,
    face: null,
    followed: null,
    faces: new Map(),
    motion: null,
  };
}

/**
 * Whether a burst of motion is worth a glance, or is just the person already
 * being watched.
 *
 * @param at - Where the motion was.
 * @param memory - What the reflexes have seen.
 * @param now - The current time.
 * @returns True when the eyes should flick to it.
 */
function worthAGlance(at: GazePoint, memory: ReflexMemory, now: number): boolean {
  if (now - memory.glancedAt < GLANCE_REFRACTORY_MS) return false;
  if (!memory.face) return true;
  return Math.hypot(at.x - memory.face.x, at.y - memory.face.y) > OWN_MOVEMENT;
}

/**
 * A face was seen. The eyes follow one face at a time: with two people in
 * view they would otherwise flick between them twelve times a second.
 *
 * @param event - The sighting.
 * @param claim - How to claim the gaze.
 * @param memory - What the reflexes have seen.
 */
function faceSeen(event: SenseEventOf<'vision.face'>, claim: Claimant, memory: ReflexMemory): void {
  const at = toGazePoint(event.x, event.y, FACE_GAIN);
  memory.faces.set(event.id, at);
  memory.followed ??= event.id;
  if (memory.followed !== event.id) return;
  // Smoothed, because the nose tip jitters frame to frame and the springs
  // chase every twitch of it.
  memory.face = memory.face ? lerp(memory.face, at, FACE_SMOOTHING) : at;
  claim('track', memory.face, LASTS.track);
}

/**
 * A face went. When it was the one being followed, somebody else still there
 * takes over on their next frame.
 *
 * @param id - Whose.
 * @param claim - How to claim the gaze.
 * @param memory - What the reflexes have seen.
 */
function faceLost(id: string, claim: Claimant, memory: ReflexMemory): void {
  memory.faces.delete(id);
  if (memory.followed !== id) return;
  memory.followed = memory.faces.keys().next().value ?? null;
  memory.face = null;
  claim('track', null, 0);
}

/**
 * Whoever is talking is who you look at. The switch takes on their next frame.
 *
 * @param event - The expression.
 * @param memory - What the reflexes have seen.
 */
function faceTalked(event: SenseEventOf<'vision.expression'>, memory: ReflexMemory): void {
  if (event.kind !== 'talking' || !memory.faces.has(event.id) || memory.followed === event.id)
    return;
  memory.followed = event.id;
  memory.face = null;
}

/**
 * The reflexes: what the character looks at without being told. A face beats
 * nothing, and a burst of motion beats a face.
 *
 * @param event - What happened.
 * @param claim - How to claim the gaze.
 * @param memory - What the reflexes have seen.
 * @param now - The current time.
 */
function reflex(event: SenseEvent, claim: Claimant, memory: ReflexMemory, now: number): void {
  switch (event.type) {
    case 'vision.face':
      faceSeen(event, claim, memory);
      return;
    case 'vision.face.lost':
      faceLost(event.id, claim, memory);
      return;
    case 'vision.expression':
      faceTalked(event, memory);
      return;
    case 'vision.motion':
      motionSeen(event, claim, memory, now);
      return;
    default:
      return;
  }
}

/**
 * Something moved. A burst well away from the face being watched earns a glance.
 *
 * @param event - The motion.
 * @param claim - How to claim the gaze.
 * @param memory - What the reflexes have seen.
 * @param now - The current time.
 */
function motionSeen(
  event: SenseEventOf<'vision.motion'>,
  claim: Claimant,
  memory: ReflexMemory,
  now: number,
): void {
  if (event.magnitude < MOTION_FLOOR) return;
  const at = toGazePoint(event.x, event.y);
  memory.motion = at;
  if (!worthAGlance(at, memory, now)) return;
  memory.glancedAt = now;
  claim('glance', at, LASTS.glance);
}

/**
 * How much of a new face position to take each frame. Lower is steadier and
 * later; this is about a tenth of a second of lag at 12 fps.
 */
const FACE_SMOOTHING = 0.45;

/**
 * Move a point part of the way toward another.
 *
 * @param from - Where it is.
 * @param to - Where it is heading.
 * @param amount - How much of the way to go, 0 to 1.
 * @returns The point in between.
 */
function lerp(from: GazePoint, to: GazePoint, amount: number): GazePoint {
  return {
    x: from.x + (to.x - from.x) * amount,
    y: from.y + (to.y - from.y) * amount,
  };
}

/**
 * Listen to everything the reflexes care about.
 *
 * @param bus - Where the sense events arrive.
 * @param react - What to do with each one.
 * @returns The unsubscribes.
 */
function subscribe(bus: Bus, react: (event: SenseEvent) => void): Unsubscribe[] {
  return [
    bus.on('vision.face', react),
    bus.on('vision.face.lost', react),
    bus.on('vision.expression', react),
    bus.on('vision.motion', react),
  ];
}

/**
 * Turn a semantic target into a place to look.
 *
 * @param target - Which of the seven.
 * @param memory - What the senses last reported.
 * @returns Where to point. A target that names something not currently in the
 * room falls back to straight ahead, which reads as attention rather than as a
 * guess in the wrong direction.
 */
function resolve(target: GazeTarget, memory: ReflexMemory): GazePoint {
  const fixed = FIXED[target];
  if (fixed) return fixed;
  if (target === 'motion') return memory.motion ?? { x: 0, y: 0 };
  return memory.face ?? { x: 0, y: 0 };
}

/** Strongest first, so the winner is the first still-valid claim found. */
const BY_STRENGTH = [...PRIORITY].reverse();

/**
 * The strongest claim still in date, dropping any that have run out.
 *
 * @param claims - The live claims. Expired entries are removed.
 * @param at - Now.
 * @returns The winning level, or `null` when nothing is claiming.
 */
function strongest(claims: Map<GazePriority, Claim>, at: number): GazePriority | null {
  for (const priority of BY_STRENGTH) {
    const held = claims.get(priority);
    if (!held) continue;
    if (held.until > at) return priority;
    claims.delete(priority);
  }
  return null;
}

/** How the arbiter is wired. */
export interface ArbiterOptions {
  /** Clock, injected for tests. Defaults to `performance.now`. */
  now?: () => number;
}

/**
 * Build the arbiter and subscribe it to the reflexes.
 *
 * @param bus - Where the sense events arrive.
 * @param options - An optional clock.
 * @returns The arbiter, already listening.
 */
export function createGazeArbiter(bus: Bus, options: ArbiterOptions = {}): GazeArbiter {
  const now = options.now ?? (() => performance.now());
  const claims = new Map<GazePriority, Claim>();

  /**
   * Record a claim.
   * @param priority - Which level.
   * @param point - Where, or `null` to drop it.
   * @param forMs - How long it lasts.
   */
  function claim(priority: GazePriority, point: GazePoint | null, forMs: number): void {
    if (!point) {
      claims.delete(priority);
      return;
    }
    claims.set(priority, { point, until: now() + forMs });
  }

  const memory = newReflexMemory();
  const listeners = subscribe(bus, (event) => {
    reflex(event, claim, memory, now());
  });

  return {
    read: () => {
      const top = strongest(claims, now());
      return top ? (claims.get(top)?.point ?? null) : null;
    },
    claim,
    look: (target, forMs) => {
      claim('hold', resolve(target, memory), forMs);
    },
    winner: () => strongest(claims, now()),
    stop: () => {
      for (const off of listeners) off();
      claims.clear();
    },
  };
}
