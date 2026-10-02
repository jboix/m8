/**
 * The tools the server carries out itself: `remember` and `recall`. Section
 * 7.3 of docs/architecture.md.
 *
 * Both answer from SQLite, so the model never waits on them for longer than it
 * waits on the eyes.
 */
import type { Database } from 'bun:sqlite';
import { ServerToolInput } from '@m8/shared';
import { addFact, searchFacts } from '../memory/facts.ts';
import { ago } from '../memory/when.ts';

/** How many memories one `recall` hands back. */
const RECALLED = 5;

/**
 * Carry out one tool call.
 *
 * @param db - The memory.
 * @param input - The parsed call.
 * @param now - When.
 * @returns What the model is told.
 */
function carryOut(db: Database, input: ServerToolInput, now: number): unknown {
  if (input.name === 'remember') {
    const kept = addFact(db, { ...input, source: 'tool' }, now);
    return { ok: true, already_known: kept.known };
  }
  const memories = searchFacts(db, input.query, RECALLED, now).map((fact) => ({
    text: fact.text,
    learned: ago(fact.createdAt, now),
  }));
  return { memories };
}

/**
 * Whether a tool is one the server carries out.
 *
 * @param name - The name the model called.
 * @returns True for `remember` and `recall`.
 */
export function isServerTool(name: string): boolean {
  return ServerToolInput.options.some((option) => option.shape.name.value === name);
}

/**
 * Validate and carry out a tool the model called.
 *
 * @param db - The memory.
 * @param call - The tool's name and its arguments, exactly as the model sent them.
 * @param now - When.
 * @returns What the model is told. Arguments that do not validate get an
 * `error` back, never silence, because the model says nothing until it is answered.
 */
export function runServerTool(
  db: Database,
  call: { name: string; args: Record<string, unknown> },
  now: number,
): unknown {
  const input = ServerToolInput.safeParse({ ...call.args, name: call.name });
  if (!input.success) return { error: 'Those arguments were not understood.' };
  return carryOut(db, input.data, now);
}
