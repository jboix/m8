import { describe, expect, test } from 'bun:test';
import { frameSize } from './frames.ts';

describe('the size of a frame', () => {
  test('puts the longer side at 320 and keeps the shape', () => {
    expect(frameSize(1280, 720)).toEqual({ width: 320, height: 180 });
    expect(frameSize(720, 1280)).toEqual({ width: 180, height: 320 });
  });

  test('never enlarges a small camera', () => {
    expect(frameSize(160, 120)).toEqual({ width: 160, height: 120 });
  });
});
