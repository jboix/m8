/**
 * Tier 1's whole vocabulary, tested without a camera. These are the rules that
 * decide when the character thinks you are there, what face you are pulling and
 * whether you waved.
 */

import { describe, expect, test } from 'bun:test';
import { FACE_EMBEDDING_SIZE, type KnownFace } from '@m8/shared';
import { deriveEvents, deriveFaceprint, faceToLearn, newVisionMemory } from './derive.ts';
import type { Blendshape, FaceFinding, Findings } from './findings.ts';

/** The one face most of these frames hold. */
const FACE: FaceFinding = { id: 'f1', x: 0.5, y: 0.5, size: 0.3, facing: 0.9, blendshapes: [] };

/**
 * A frame with a face in it.
 *
 * @param ts - When.
 * @param over - Anything to change about the frame, and `face` to change the face.
 * @returns The findings.
 */
function seen(
  ts: number,
  over: Partial<Findings> & { face?: Partial<FaceFinding> } = {},
): Findings {
  const { face, ...frame } = over;
  return {
    ts,
    faces: [{ ...FACE, ...face }],
    gesture: null,
    hand: null,
    motion: null,
    ...frame,
  };
}

/**
 * A frame with nobody in it.
 *
 * @param ts - When.
 * @returns The findings.
 */
function empty(ts: number): Findings {
  return { ts, faces: [], gesture: null, hand: null, motion: null };
}

/**
 * Blendshapes with one firing.
 *
 * @param name - Which one.
 * @param score - How hard.
 * @returns The set.
 */
function firing(name: string, score: number): Blendshape[] {
  return [{ name, score }];
}

/** Every event type a run produced. */
function typesOf(findings: Findings[]): string[] {
  const memory = newVisionMemory();
  return findings.flatMap((frame) => deriveEvents(frame, memory)).map((event) => event.type);
}

describe('deriving a face', () => {
  test('reports a face where it is', () => {
    const [event] = deriveEvents(seen(100), newVisionMemory());

    expect(event).toMatchObject({ type: 'vision.face', x: 0.5, y: 0.5, facing: true });
  });

  test('calls a turned-away face not facing', () => {
    const [event] = deriveEvents(seen(100, { face: { facing: 0.2 } }), newVisionMemory());

    expect(event).toMatchObject({ type: 'vision.face', facing: false });
  });

  test('waits out a dropped frame before calling the face lost', () => {
    const memory = newVisionMemory();
    deriveEvents(seen(0), memory);

    expect(deriveEvents(empty(300), memory).map((event) => event.type)).not.toContain(
      'vision.face.lost',
    );
    expect(deriveEvents(empty(900), memory).map((event) => event.type)).toContain(
      'vision.face.lost',
    );
  });

  test('reports a face lost only once', () => {
    const memory = newVisionMemory();
    deriveEvents(seen(0), memory);
    deriveEvents(empty(900), memory);

    expect(deriveEvents(empty(1000), memory)).toEqual([]);
  });
});

describe('deriving presence', () => {
  test('says someone arrived, once', () => {
    const memory = newVisionMemory();

    expect(deriveEvents(seen(0), memory)).toContainEqual(
      expect.objectContaining({ type: 'presence', state: 'present' }),
    );
    expect(deriveEvents(seen(100), memory)).not.toContainEqual(
      expect.objectContaining({ type: 'presence' }),
    );
  });

  test('holds on for a few seconds before deciding the room is empty', () => {
    const memory = newVisionMemory();
    deriveEvents(seen(0), memory);
    deriveEvents(empty(1000), memory);

    expect(deriveEvents(empty(3000), memory)).not.toContainEqual(
      expect.objectContaining({ type: 'presence' }),
    );
    expect(deriveEvents(empty(5000), memory)).toContainEqual(
      expect.objectContaining({ type: 'presence', state: 'absent' }),
    );
  });
});

describe('deriving an expression', () => {
  test('reads a smile off the blendshapes', () => {
    const face = { blendshapes: firing('mouthSmileLeft', 0.8) };

    expect(deriveEvents(seen(0, { face }), newVisionMemory())).toContainEqual(
      expect.objectContaining({ type: 'vision.expression', kind: 'smile' }),
    );
  });

  test('ignores a twitch below the floor', () => {
    const face = {
      x: 0.5,
      y: 0.5,
      size: 0.3,
      facing: 0.9,
      blendshapes: firing('mouthSmileLeft', 0.2),
    };

    expect(typesOf([seen(0, { face })])).not.toContain('vision.expression');
  });

  test('reports a held smile once, not every frame', () => {
    const face = {
      x: 0.5,
      y: 0.5,
      size: 0.3,
      facing: 0.9,
      blendshapes: firing('mouthSmileLeft', 0.9),
    };
    const frames = [0, 100, 200, 300, 400].map((ts) => seen(ts, { face }));

    expect(typesOf(frames).filter((type) => type === 'vision.expression')).toHaveLength(1);
  });

  test('reports it again once it has had time to be new', () => {
    const face = {
      x: 0.5,
      y: 0.5,
      size: 0.3,
      facing: 0.9,
      blendshapes: firing('mouthSmileLeft', 0.9),
    };
    const frames = [0, 2000].map((ts) => seen(ts, { face }));

    expect(typesOf(frames).filter((type) => type === 'vision.expression')).toHaveLength(2);
  });
});

describe('deriving two faces', () => {
  /** A frame with two people in it, one of them smiling. */
  const pair = (ts: number): Findings =>
    seen(ts, {
      faces: [
        { ...FACE, id: 'f1', x: 0.3 },
        { ...FACE, id: 'f2', x: 0.7, blendshapes: firing('mouthSmileLeft', 0.9) },
      ],
    });

  test('reports each face under its own id', () => {
    const ids = deriveEvents(pair(0), newVisionMemory())
      .filter((event) => event.type === 'vision.face')
      .map((event) => event.id);

    expect(ids).toEqual(['f1', 'f2']);
  });

  test('says which face is smiling', () => {
    expect(deriveEvents(pair(0), newVisionMemory())).toContainEqual(
      expect.objectContaining({ type: 'vision.expression', id: 'f2', kind: 'smile' }),
    );
  });

  test('loses one face while the other stays', () => {
    const memory = newVisionMemory();
    deriveEvents(pair(0), memory);
    const events = deriveEvents(seen(1000, { faces: [{ ...FACE, id: 'f1', x: 0.3 }] }), memory);

    expect(events).toContainEqual({ type: 'vision.face.lost', ts: 1000, id: 'f2' });
    expect(events).not.toContainEqual(expect.objectContaining({ type: 'presence' }));
  });
});

describe('deriving a gesture', () => {
  test('maps the canned gestures into the tool vocabulary', () => {
    const memory = newVisionMemory();
    const events = deriveEvents(seen(0, { gesture: 'Thumb_Up' }), memory);

    expect(events).toContainEqual(
      expect.objectContaining({ type: 'vision.gesture', kind: 'thumbs_up' }),
    );
  });

  test('calls a still open palm an open palm', () => {
    const memory = newVisionMemory();
    const events = deriveEvents(
      seen(0, { gesture: 'Open_Palm', hand: { x: 0.5, y: 0.4 } }),
      memory,
    );

    expect(events).toContainEqual(expect.objectContaining({ kind: 'open_palm' }));
  });

  test('calls an open palm that crossed sideways a wave', () => {
    const memory = newVisionMemory();
    const path = [0.4, 0.48, 0.56];
    const events = path.flatMap((x, step) =>
      deriveEvents(seen(step * 200, { gesture: 'Open_Palm', hand: { x, y: 0.4 } }), memory),
    );

    expect(events.map((event) => 'kind' in event && event.kind)).toContain('wave');
  });

  test('forgets a palm that drifted too slowly to be a wave', () => {
    const memory = newVisionMemory();
    const events = [0, 2000, 4000].flatMap((ts) =>
      deriveEvents(seen(ts, { gesture: 'Open_Palm', hand: { x: ts / 10000, y: 0.4 } }), memory),
    );

    expect(events.map((event) => 'kind' in event && event.kind)).not.toContain('wave');
  });

  test('ignores gestures it has no word for', () => {
    expect(typesOf([seen(0, { gesture: 'ILoveYou' })])).not.toContain('vision.gesture');
  });
});

describe('deriving motion', () => {
  test('passes motion through when there is any', () => {
    const motion = { x: 0.2, y: 0.8, magnitude: 0.5 };

    expect(deriveEvents(empty(0), newVisionMemory())).toEqual([]);
    expect(deriveEvents({ ...empty(0), motion }, newVisionMemory())).toContainEqual(
      expect.objectContaining({ type: 'vision.motion', magnitude: 0.5 }),
    );
  });

  test('says nothing about a still frame', () => {
    const motion = { x: 0.5, y: 0.5, magnitude: 0 };

    expect(typesOf([{ ...empty(0), motion }])).not.toContain('vision.motion');
  });
});

describe('deriving being left alone', () => {
  /**
   * The stages reported for one empty frame.
   *
   * @param events - What a frame derived.
   * @returns The `alone` stages among them, in order.
   */
  function stages(events: ReturnType<typeof deriveEvents>): string[] {
    return events.flatMap((event) => (event.type === 'alone' ? [event.stage] : []));
  }

  test('goes through the stages once each, as nobody comes back', () => {
    const memory = newVisionMemory();
    deriveEvents(seen(0), memory);

    expect(stages(deriveEvents(empty(3000), memory))).toEqual([]);
    expect(stages(deriveEvents(empty(5000), memory))).toEqual(['looking']);
    expect(stages(deriveEvents(empty(6000), memory))).toEqual([]);
    expect(stages(deriveEvents(empty(20_000), memory))).toEqual(['drowsy']);
    expect(stages(deriveEvents(empty(50_000), memory))).toEqual(['dozing', 'asleep']);
  });

  test('starts over when somebody comes back', () => {
    const memory = newVisionMemory();
    deriveEvents(seen(0), memory);
    deriveEvents(empty(20_000), memory);
    deriveEvents(seen(21_000), memory);

    expect(stages(deriveEvents(empty(26_000), memory))).toEqual(['looking']);
  });

  test('says nothing in a room nobody has ever been in', () => {
    expect(stages(deriveEvents(empty(60_000), newVisionMemory()))).toEqual([]);
  });
});

describe('judging a face', () => {
  /**
   * A unit embedding pointing mostly one way.
   *
   * @param at - Which value carries it.
   * @param lean - How far it leans toward the next value, 0 to 1.
   * @returns The embedding.
   */
  const print = (at: number, lean = 0): number[] => {
    const values = new Array<number>(FACE_EMBEDDING_SIZE).fill(0);
    const length = Math.hypot(1, lean);
    values[at] = 1 / length;
    values[at + 1] = lean / length;
    return values;
  };
  const known: KnownFace[] = [
    { id: 1, name: 'Ada', embedding: print(0), createdAt: 0 },
    { id: 2, name: 'Bo', embedding: print(10), createdAt: 0 },
  ];

  /** A memory with Ada and Bo in it and one face in view. */
  const seeing = () => {
    const memory = newVisionMemory();
    memory.known = known;
    deriveEvents(seen(0), memory);
    return memory;
  };

  test('names a face that is like one it knows', () => {
    const events = deriveFaceprint({ id: 'f1', ts: 10, embedding: print(10, 0.3) }, seeing());

    expect(events).toEqual([
      { type: 'vision.person', ts: 10, id: 'f1', name: 'Bo', score: expect.any(Number) },
    ]);
  });

  test('calls a face it does not know unknown', () => {
    const events = deriveFaceprint({ id: 'f1', ts: 10, embedding: print(100) }, seeing());

    expect(events).toEqual([expect.objectContaining({ type: 'vision.person', name: null })]);
  });

  test('says so once, and again only when its mind changes', () => {
    const memory = seeing();
    const first = deriveFaceprint({ id: 'f1', ts: 10, embedding: print(0) }, memory);
    const same = deriveFaceprint({ id: 'f1', ts: 20, embedding: print(0) }, memory);

    expect(first).toHaveLength(1);
    expect(same).toEqual([]);
  });

  test('is not swayed by one odd frame', () => {
    const memory = seeing();
    for (let sample = 0; sample < 4; sample++) {
      deriveFaceprint({ id: 'f1', ts: sample, embedding: print(0) }, memory);
    }

    expect(deriveFaceprint({ id: 'f1', ts: 5, embedding: print(10) }, memory)).toEqual([]);
  });

  test('ignores an embedding of a face that has gone', () => {
    const memory = seeing();
    deriveEvents(empty(2000), memory);

    expect(deriveFaceprint({ id: 'f1', ts: 2001, embedding: print(0) }, memory)).toEqual([]);
  });

  test('says a face is in view but not embedded yet', () => {
    expect(faceToLearn(seeing())).toEqual({ embedding: null, inView: 1 });
  });

  test('offers the largest embedded face to learn', () => {
    const memory = seeing();
    deriveEvents(
      seen(1, {
        faces: [
          { ...FACE, id: 'f1', size: 0.2 },
          { ...FACE, id: 'f2', x: 0.8, size: 0.4 },
        ],
      }),
      memory,
    );
    deriveFaceprint({ id: 'f1', ts: 2, embedding: print(0) }, memory);
    deriveFaceprint({ id: 'f2', ts: 2, embedding: print(50) }, memory);

    expect(faceToLearn(memory)).toEqual({ embedding: print(50), inView: 2 });
    expect(faceToLearn(newVisionMemory())).toEqual({ embedding: null, inView: 0 });
  });
});
