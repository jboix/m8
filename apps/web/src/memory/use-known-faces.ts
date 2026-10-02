/**
 * The faces he knows, read from the memory routes and kept current as faces
 * are learned and forgotten. Empty while recognition is off.
 */
import { type KnownFace, KnownFaces } from '@m8/shared';
import { useCallback, useEffect, useMemo, useState } from 'react';

/** What the app can do with the faces. */
export interface KnownFacesView {
  /** Every face he knows. */
  known: KnownFace[];
  /** Why the last request failed, or `null`. */
  fault: string | null;
  /**
   * Learn one more embedding of a person's face.
   * @param name - Whose.
   * @param embedding - The embedding.
   */
  learn: (name: string, embedding: number[]) => void;
  /**
   * Forget one stored face.
   * @param id - Which.
   */
  forget: (id: number) => void;
  /** Read the list again. */
  refresh: () => void;
}

/**
 * Ask the faces route.
 *
 * @param init - The request, or nothing for a plain read.
 * @returns Every face, parsed.
 * @throws {Error} When the server does not answer with a list of faces.
 */
async function ask(init?: RequestInit): Promise<KnownFace[]> {
  const response = await fetch('/api/memory/faces', init);
  if (!response.ok) throw new Error(`the server answered ${response.status}`);
  return KnownFaces.parse(await response.json());
}

/**
 * The requests behind the list: a read, and a write followed by a read.
 *
 * @param setKnown - Where a read's answer goes.
 * @returns The two requests and the last fault.
 */
function useFaceRequests(setKnown: (faces: KnownFace[]) => void) {
  const [fault, setFault] = useState<string | null>(null);
  const failed = useCallback((error: unknown) => {
    setFault(error instanceof Error ? error.message : String(error));
  }, []);
  const refresh = useCallback(() => {
    ask()
      .then((faces) => {
        setKnown(faces);
        setFault(null);
      })
      .catch(failed);
  }, [setKnown, failed]);
  // A write, then a read: the list is easier to keep right by asking for it again.
  const change = useCallback(
    (path: string, init: RequestInit) => {
      fetch(`/api/memory/faces${path}`, init).then(refresh).catch(failed);
    },
    [refresh, failed],
  );
  return { fault, refresh, change };
}

/**
 * The faces he knows.
 *
 * @param on - Whether recognition is on. Off, the list stays empty and nothing is fetched.
 * @returns The faces and the ways to change them.
 */
export function useKnownFaces(on: boolean): KnownFacesView {
  const [known, setKnown] = useState<KnownFace[]>([]);
  const { fault, refresh, change } = useFaceRequests(setKnown);

  useEffect(() => {
    if (on) refresh();
    else setKnown([]);
  }, [on, refresh]);

  return useMemo(
    () => ({
      known,
      fault,
      refresh,
      learn: (name, embedding) => {
        const body = JSON.stringify({ name, embedding });
        change('', { method: 'POST', headers: { 'content-type': 'application/json' }, body });
      },
      forget: (id) => {
        change(`/${id}`, { method: 'DELETE' });
      },
    }),
    [known, fault, refresh, change],
  );
}
