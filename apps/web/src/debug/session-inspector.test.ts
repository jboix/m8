/** The transcriber's markers, dropped from what was said. */
import { describe, expect, test } from 'bun:test';
import { spoken } from './session-inspector.tsx';

describe('spoken', () => {
  test('drops the markers and keeps the words', () => {
    expect(spoken('hello <noise> there {pause} friend')).toBe('hello  there  friend');
    expect(spoken('<no speech detected>')).toBe('');
  });

  test('leaves no marker behind, however they are nested', () => {
    for (const line of ['a <scr<x>ipt> b', 'a <<x>script> b', '{{x}pause}', '<a{b>c}>']) {
      expect(spoken(line)).not.toMatch(/<[^>]*>|\{[^}]*\}/);
    }
  });
});
