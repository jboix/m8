/** Reads the character's memory from the server, for the settings sheet and the rig's memory tab. */
import { MemorySnapshot } from '@m8/shared';
import { useCallback, useEffect, useState } from 'react';

/** The memory as the browser sees it, and what it may do to it. */
export interface MemoryView {
  /** What is remembered, or null before the first answer. */
  snapshot: MemorySnapshot | null;
  /** Why the last request failed, or null when it did not. */
  fault: string | null;
  /** Read it again. */
  refresh: () => void;
  /**
   * Delete a fact for good.
   * @param id - The fact.
   */
  forget: (id: number) => void;
  /** Delete every memory for good. */
  forgetAll: () => void;
  /**
   * Make an older self-model the current one.
   * @param version - The version to return to.
   */
  rollBack: (version: number) => void;
}

/**
 * Ask the server for the memory, or to change it.
 *
 * @param path - The route, under `/api/memory`.
 * @param init - The method and body. Absent, it is a plain read.
 * @returns The snapshot the server answered with.
 * @throws {Error} When the server is unreachable, refuses, or answers with
 * something that is not a snapshot.
 */
async function ask(path: string, init?: RequestInit): Promise<MemorySnapshot> {
  const response = await fetch(`/api/memory${path}`, init);
  if (!response.ok) throw new Error(`the server answered ${response.status}`);
  return MemorySnapshot.parse(await response.json());
}

/**
 * Keep a view of the memory.
 *
 * @param open - True while it is on show. The memory is read each time this
 * becomes true, so it is current whenever it is looked at.
 * @returns The snapshot and the ways to change it.
 */
export function useMemory(open: boolean): MemoryView {
  const [snapshot, setSnapshot] = useState<MemorySnapshot | null>(null);
  const [fault, setFault] = useState<string | null>(null);

  const run = useCallback((path: string, init?: RequestInit) => {
    ask(path, init)
      .then((next) => {
        setSnapshot(next);
        setFault(null);
      })
      .catch((error: unknown) => {
        setFault(error instanceof Error ? error.message : String(error));
      });
  }, []);

  useEffect(() => {
    if (open) run('');
  }, [open, run]);

  return {
    snapshot,
    fault,
    refresh: () => {
      run('');
    },
    forgetAll: () => {
      run('', { method: 'DELETE' });
    },
    forget: (id) => {
      run(`/facts/${id}`, { method: 'DELETE' });
    },
    rollBack: (version) => {
      run('/self-model/rollback', { method: 'POST', body: JSON.stringify({ version }) });
    },
  };
}
