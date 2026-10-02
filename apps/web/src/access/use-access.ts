/**
 * Whether this browser may talk to the character. A server reachable by other
 * people asks for a key once, and answers with a cookie the browser keeps.
 */
import { AccessState } from '@m8/shared';
import { useCallback, useEffect, useState } from 'react';

/** Where the browser stands, and the way to give the key. */
export interface Access {
  /**
   * `checking` until the server has answered, `locked` when it wants a key this
   * browser has not given, `open` otherwise.
   */
  state: 'checking' | 'locked' | 'open';
  /** What went wrong with the last key: refused, or too many tries. */
  fault: 'wrong' | 'wait' | null;
  /**
   * Give the key.
   * @param key - What somebody typed.
   */
  unlock: (key: string) => void;
}

/**
 * Ask the server where this browser stands.
 *
 * @returns Its answer. A server that cannot be reached counts as open, so that
 * what the person sees is the notice about the connection and not a key screen
 * that cannot work.
 */
async function readAccess(): Promise<AccessState> {
  try {
    return AccessState.parse(await (await fetch('/api/access')).json());
  } catch {
    return { required: false, granted: true };
  }
}

/**
 * Read what went wrong out of the server's answer to a key.
 *
 * @param response - The answer.
 * @returns Null when the key was accepted, `wait` after too many tries, `wrong` otherwise.
 */
function faultOf(response: Response): Access['fault'] {
  if (response.ok) return null;
  return response.status === 429 ? 'wait' : 'wrong';
}

/**
 * Keep track of whether this browser is let in.
 *
 * @returns The state, the last fault, and the way to give the key.
 */
export function useAccess(): Access {
  const [state, setState] = useState<Access['state']>('checking');
  const [fault, setFault] = useState<Access['fault']>(null);

  useEffect(() => {
    void readAccess().then((access) => {
      setState(access.granted ? 'open' : 'locked');
    });
  }, []);

  const unlock = useCallback((key: string) => {
    const body = JSON.stringify({ key });
    void fetch('/api/access/unlock', { method: 'POST', body }).then((response) => {
      if (response.ok) setState('open');
      setFault(faultOf(response));
    });
  }, []);

  return { state, fault, unlock };
}
