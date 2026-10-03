/**
 * The frozen core persona. This file is in git, it is read at the start of every
 * live session, and no model may write to it. The part of the character that
 * changes lives in SQLite instead.
 */
/// <reference path="./markdown.d.ts" />
// Imported as text, so a bundle carries the persona inside it and nothing is
// read from disk at run time.
import PERSONA from '../persona.md' with { type: 'text' };

/** What the setup screen decided, written into the persona's `{{slots}}`. */
export interface PersonaSlots {
  /** The only language he speaks, named in English: the persona is in English. */
  language: string;
  /** The standard accent he speaks it with. */
  accent: string;
  /** How he says his own name in that language. */
  spokenName: string;
  /** Who set him up. The caller validates it, because it lands in the prompt. */
  name: string;
}

/**
 * Write the slots into the persona text.
 *
 * @param text - The persona, with `{{language}}`, `{{accent}}`, `{{spokenName}}`
 * and `{{name}}` in it.
 * @param slots - What goes in them.
 * @returns The text with every slot filled.
 * @throws {Error} When a slot is left over, which means the file names one this
 * code does not know and the model would be told to speak `{{something}}`.
 */
export function fillPersona(text: string, slots: PersonaSlots): string {
  const filled = text
    .replaceAll('{{language}}', slots.language)
    .replaceAll('{{accent}}', slots.accent)
    .replaceAll('{{spokenName}}', slots.spokenName)
    .replaceAll('{{name}}', slots.name);
  const leftover = /\{\{[^}]*\}\}/.exec(filled);
  if (leftover) throw new Error(`The persona has a slot nothing fills: ${leftover[0]}`);
  return filled;
}

/**
 * Read the core persona.
 *
 * @param slots - The language and the name the setup screen collected.
 * @returns Its text, with the slots filled and the leading `# Core persona`
 * heading dropped: the model is being told who it is, not handed a document.
 */
export async function loadPersona(slots: PersonaSlots): Promise<string> {
  return fillPersona(PERSONA.replace(/^#[^\n]*\n+/, '').trim(), slots);
}
