/** The conversions at the edge of the audio path. Wrong here sounds like static. */
import { describe, expect, test } from 'bun:test';
import { bytesToPcm16, float32ToPcm16, pcm16ToFloat32 } from './pcm.ts';

describe('float32ToPcm16', () => {
  test('maps the full range to the full range', () => {
    const pcm = float32ToPcm16(new Float32Array([-1, 0, 1]));

    expect([...pcm]).toEqual([-32768, 0, 32767]);
  });

  test('clamps rather than wrapping, so a loud voice does not become a buzz', () => {
    const pcm = float32ToPcm16(new Float32Array([-3, 3]));

    expect([...pcm]).toEqual([-32768, 32767]);
  });

  test('round-trips within a sample of itself', () => {
    const original = new Float32Array([-0.8, -0.25, 0, 0.25, 0.8]);
    const back = pcm16ToFloat32(float32ToPcm16(original));

    for (let index = 0; index < original.length; index++) {
      expect(back[index]).toBeCloseTo(original[index] ?? 0, 3);
    }
  });
});

describe('bytesToPcm16', () => {
  test('reads little-endian samples', () => {
    const bytes = new Uint8Array([0x00, 0x80, 0xff, 0x7f]).buffer;

    expect([...bytesToPcm16(bytes)]).toEqual([-32768, 32767]);
  });

  test('drops a trailing odd byte rather than throwing', () => {
    const bytes = new Uint8Array([0x01, 0x00, 0x7f]).buffer;

    expect([...bytesToPcm16(bytes)]).toEqual([1]);
  });

  test('survives a buffer that starts at an odd offset', () => {
    const backing = new Uint8Array([0xaa, 0x00, 0x80, 0xff, 0x7f]);
    const odd = backing.buffer.slice(1);

    expect([...bytesToPcm16(odd)]).toEqual([-32768, 32767]);
  });
});
