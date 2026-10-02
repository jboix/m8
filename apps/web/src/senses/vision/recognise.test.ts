/** The alignment lands a face on the template, and a match picks the closest known face. */

import { describe, expect, test } from 'bun:test';
import {
  alignment,
  CROP_SIZE,
  closest,
  type FacePoints,
  type Point,
  similarity,
  type Transform,
  toTensor,
  unit,
} from './recognise.ts';

/** The template itself, as a face would report it. */
const TEMPLATE: FacePoints = {
  leftEye: { x: 38.2946, y: 51.6963 },
  rightEye: { x: 73.5318, y: 51.5014 },
  nose: { x: 56.0252, y: 71.7366 },
  leftMouth: { x: 41.5493, y: 92.3655 },
  rightMouth: { x: 70.7299, y: 92.2041 },
};

/**
 * Apply a transform to a point.
 *
 * @param transform - The transform.
 * @param point - The point.
 * @returns Where it lands.
 */
function apply(transform: Transform, point: Point): Point {
  return {
    x: transform.a * point.x + transform.c * point.y + transform.e,
    y: transform.b * point.x + transform.d * point.y + transform.f,
  };
}

/**
 * A face somewhere else in a frame: the template scaled, turned and moved.
 *
 * @param scale - How much bigger.
 * @param degrees - How far it is tilted.
 * @param shift - Where its origin moved to.
 * @returns The five points.
 */
function placed(scale: number, degrees: number, shift: Point): FacePoints {
  const radians = (degrees * Math.PI) / 180;
  const move = (point: Point): Point => ({
    x: scale * (Math.cos(radians) * point.x - Math.sin(radians) * point.y) + shift.x,
    y: scale * (Math.sin(radians) * point.x + Math.cos(radians) * point.y) + shift.y,
  });
  return {
    leftEye: move(TEMPLATE.leftEye),
    rightEye: move(TEMPLATE.rightEye),
    nose: move(TEMPLATE.nose),
    leftMouth: move(TEMPLATE.leftMouth),
    rightMouth: move(TEMPLATE.rightMouth),
  };
}

describe('alignment', () => {
  test('leaves a face already on the template alone', () => {
    const transform = alignment(TEMPLATE);

    expect(transform.a).toBeCloseTo(1, 6);
    expect(transform.b).toBeCloseTo(0, 6);
    expect(transform.e).toBeCloseTo(0, 6);
    expect(transform.f).toBeCloseTo(0, 6);
  });

  test('brings a bigger, tilted, moved face back onto the template', () => {
    const face = placed(2.5, 12, { x: 140, y: 60 });
    const transform = alignment(face);

    for (const name of ['leftEye', 'rightEye', 'nose', 'leftMouth', 'rightMouth'] as const) {
      const landed = apply(transform, face[name]);
      expect(landed.x).toBeCloseTo(TEMPLATE[name].x, 4);
      expect(landed.y).toBeCloseTo(TEMPLATE[name].y, 4);
    }
  });

  test('never reflects, so a face stays a face', () => {
    const transform = alignment(placed(1.3, -30, { x: 20, y: 20 }));

    expect(transform.a * transform.d - transform.b * transform.c).toBeGreaterThan(0);
  });
});

describe('toTensor', () => {
  test('scales pixels into -1 to 1 by plane', () => {
    const rgba = new Uint8ClampedArray(CROP_SIZE * CROP_SIZE * 4);
    rgba[0] = 255;
    rgba[1] = 0;
    rgba[2] = 128;
    const data = toTensor(rgba);

    expect(data[0]).toBeCloseTo(0.996, 3);
    expect(data[CROP_SIZE * CROP_SIZE]).toBeCloseTo(-0.996, 3);
    expect(data[2 * CROP_SIZE * CROP_SIZE]).toBeCloseTo(0.004, 3);
  });

  test('reads the crop from the right when mirrored', () => {
    const rgba = new Uint8ClampedArray(CROP_SIZE * CROP_SIZE * 4);
    rgba[(CROP_SIZE - 1) * 4] = 255;

    expect(toTensor(rgba, true)[0]).toBeCloseTo(0.996, 3);
    expect(toTensor(rgba)[0]).toBeCloseTo(-0.996, 3);
  });
});

describe('matching', () => {
  test('a unit vector is as like itself as it can be', () => {
    const vector = unit([3, 4]);

    expect(similarity(vector, vector)).toBeCloseTo(1, 10);
  });

  test('picks the closest known face', () => {
    const known = [
      { name: 'Anna', embedding: unit([1, 0, 0]) },
      { name: 'Josep', embedding: unit([0, 1, 0]) },
      { name: 'Josep', embedding: unit([0, 1, 0.2]) },
    ];

    expect(closest(unit([0.1, 1, 0.1]), known)).toMatchObject({ name: 'Josep' });
    expect(closest(unit([1, 0.1, 0]), known)).toMatchObject({ name: 'Anna' });
  });

  test('knows nobody when it knows nobody', () => {
    expect(closest(unit([1, 0]), [])).toBeNull();
  });
});
