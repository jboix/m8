import { describe, expect, test } from 'bun:test';
import { fillPersona, loadPersona } from './index.ts';

describe('fillPersona', () => {
  test('fills every occurrence of a slot', () => {
    const filled = fillPersona('{{language}}, {{name}}, {{accent}}, {{spokenName}}, {{language}}', {
      language: 'Spanish',
      accent: 'Castilian',
      spokenName: 'eme ocho',
      name: 'Josep',
    });
    expect(filled).toBe('Spanish, Josep, Castilian, eme ocho, Spanish');
  });

  test('refuses a slot nothing fills', () => {
    expect(() =>
      fillPersona('{{mood}}', {
        language: 'French',
        accent: 'Parisian',
        spokenName: 'em huit',
        name: 'Ada',
      }),
    ).toThrow('{{mood}}');
  });
});

describe('loadPersona', () => {
  test('states the language first and last, and drops the heading', async () => {
    const persona = await loadPersona({
      language: 'Japanese',
      accent: 'standard Tokyo Japanese',
      spokenName: 'エムはち (emu hachi)',
      name: 'Ada',
    });
    expect(persona.startsWith('You speak Japanese.')).toBe(true);
    expect(persona.endsWith('Remember: Japanese only.')).toBe(true);
    expect(persona).toContain('is called Ada.');
    expect(persona).toContain('You say it\n"エムはち (emu hachi)"');
  });
});
