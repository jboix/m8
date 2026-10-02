/**
 * Gives each face an id that survives from frame to frame. The landmarker
 * reports faces in an order of its own, so without this "the second face" is
 * a different person every frame. Pure, so it is tested without a camera.
 */

/** A face as the landmarker reports it, before it has an id. */
export interface Sighting {
  /** Horizontal position of the nose, 0 to 1, mirrored. */
  x: number;
  /** Vertical position of the nose, 0 to 1. */
  y: number;
}

/** One face being followed. */
export interface Track {
  /** Its id. Unique for the life of the tracker. */
  id: string;
  /** Where it was last seen. */
  x: number;
  /** Where it was last seen. */
  y: number;
  /** When it was last seen. */
  seenAt: number;
}

/** What the tracker carries between frames. */
export interface Tracking {
  /** Every face still being followed. */
  tracks: Track[];
  /** How many ids have been handed out. */
  issued: number;
}

/**
 * How far a face may move between frames and still be the same face, as a
 * share of the frame. At twelve frames a second a head does not cross a fifth
 * of the frame in one frame; a second person appearing beside it does.
 */
const SAME_FACE_REACH = 0.2;

/** How long a face may go unseen before its id is dropped. */
const TRACK_GRACE_MS = 700;

/** A sighting and a track that are close enough to be the same face. */
interface Pair {
  /** Index into the sightings. */
  sighting: number;
  /** The track. */
  track: Track;
  /** How far apart they are. */
  distance: number;
}

/**
 * A tracker with nobody in it.
 *
 * @returns The state.
 */
export function newTracking(): Tracking {
  return { tracks: [], issued: 0 };
}

/**
 * Every sighting and track close enough to be the same face, closest first.
 *
 * @param tracks - The faces being followed.
 * @param sightings - The faces in this frame.
 * @returns The candidate pairs.
 */
function candidates(tracks: Track[], sightings: Sighting[]): Pair[] {
  const pairs: Pair[] = [];
  for (const [sighting, seen] of sightings.entries()) {
    for (const track of tracks) {
      const distance = Math.hypot(seen.x - track.x, seen.y - track.y);
      if (distance <= SAME_FACE_REACH) pairs.push({ sighting, track, distance });
    }
  }
  return pairs.sort((a, b) => a.distance - b.distance);
}

/**
 * Give a sighting a fresh track.
 *
 * @param tracking - Mutated in place.
 * @param seen - The face.
 * @param ts - When.
 * @returns The new track's id.
 */
function issue(tracking: Tracking, seen: Sighting, ts: number): string {
  tracking.issued += 1;
  const track = { id: `f${tracking.issued}`, x: seen.x, y: seen.y, seenAt: ts };
  tracking.tracks.push(track);
  return track.id;
}

/**
 * Match one frame's faces to the faces being followed.
 *
 * @remarks
 * Closest pair first, so two faces that both moved keep their own ids rather
 * than swapping them. A face nobody is close to gets a new id. A track nothing
 * matched is kept for a grace period, then dropped.
 *
 * @param tracking - Mutated in place.
 * @param sightings - The faces in this frame.
 * @param ts - The frame's time.
 * @returns The id of each sighting, in the same order.
 */
export function assignTracks(tracking: Tracking, sightings: Sighting[], ts: number): string[] {
  // Stale tracks go first, or a face that comes back after a long gap where
  // another one was standing would take that one's id.
  tracking.tracks = tracking.tracks.filter((track) => ts - track.seenAt <= TRACK_GRACE_MS);
  const ids: (string | null)[] = sightings.map(() => null);
  const taken = new Set<Track>();
  for (const pair of candidates(tracking.tracks, sightings)) {
    if (ids[pair.sighting] !== null || taken.has(pair.track)) continue;
    const seen = sightings[pair.sighting];
    if (!seen) continue;
    Object.assign(pair.track, { x: seen.x, y: seen.y, seenAt: ts });
    ids[pair.sighting] = pair.track.id;
    taken.add(pair.track);
  }
  return sightings.map((seen, index) => ids[index] ?? issue(tracking, seen, ts));
}
