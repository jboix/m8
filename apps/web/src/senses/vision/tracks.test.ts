/** A face keeps its id while it moves, loses it when it is gone, and never takes another face's. */

import { describe, expect, test } from 'bun:test';
import { assignTracks, newTracking } from './tracks.ts';

describe('assignTracks', () => {
  test('gives a new face a new id', () => {
    const tracking = newTracking();

    expect(assignTracks(tracking, [{ x: 0.5, y: 0.5 }], 0)).toEqual(['f1']);
  });

  test('keeps the id of a face that moved a little', () => {
    const tracking = newTracking();
    assignTracks(tracking, [{ x: 0.5, y: 0.5 }], 0);

    expect(assignTracks(tracking, [{ x: 0.55, y: 0.48 }], 83)).toEqual(['f1']);
  });

  test('gives a second face beside the first its own id', () => {
    const tracking = newTracking();
    assignTracks(tracking, [{ x: 0.3, y: 0.5 }], 0);

    expect(
      assignTracks(
        tracking,
        [
          { x: 0.7, y: 0.5 },
          { x: 0.31, y: 0.5 },
        ],
        83,
      ),
    ).toEqual(['f2', 'f1']);
  });

  test('keeps two faces apart when both move', () => {
    const tracking = newTracking();
    assignTracks(
      tracking,
      [
        { x: 0.3, y: 0.5 },
        { x: 0.6, y: 0.5 },
      ],
      0,
    );

    expect(
      assignTracks(
        tracking,
        [
          { x: 0.65, y: 0.5 },
          { x: 0.35, y: 0.5 },
        ],
        83,
      ),
    ).toEqual(['f2', 'f1']);
  });

  test('keeps a face through a dropped frame', () => {
    const tracking = newTracking();
    assignTracks(tracking, [{ x: 0.5, y: 0.5 }], 0);
    assignTracks(tracking, [], 83);

    expect(assignTracks(tracking, [{ x: 0.5, y: 0.5 }], 166)).toEqual(['f1']);
  });

  test('forgets a face that has been gone a while', () => {
    const tracking = newTracking();
    assignTracks(tracking, [{ x: 0.5, y: 0.5 }], 0);
    assignTracks(tracking, [], 1000);

    expect(assignTracks(tracking, [{ x: 0.5, y: 0.5 }], 1083)).toEqual(['f2']);
  });

  test('forgets a face across a gap with no frames at all', () => {
    const tracking = newTracking();
    assignTracks(tracking, [{ x: 0.5, y: 0.5 }], 0);

    expect(assignTracks(tracking, [{ x: 0.5, y: 0.5 }], 5000)).toEqual(['f2']);
  });

  test('calls a face that jumped across the frame a new one', () => {
    const tracking = newTracking();
    assignTracks(tracking, [{ x: 0.1, y: 0.5 }], 0);

    expect(assignTracks(tracking, [{ x: 0.9, y: 0.5 }], 83)).toEqual(['f2']);
  });
});
