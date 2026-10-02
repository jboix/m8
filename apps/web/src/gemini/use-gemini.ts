/**
 * The Gemini account, as the app sees it: whether the server has a key, which
 * models it uses, and the ways to change both.
 */
import type { GeminiAccount, GeminiChoiceChange, GeminiModels } from '@m8/shared';
import { useCallback, useEffect, useState } from 'react';
import { choose, listModels, readAccount, saveKey } from './api.ts';

/** The account and the ways to change it. */
export interface Gemini {
  /**
   * `checking` until the server has answered, `asking` while the setup step
   * is up, `ready` otherwise. A server that cannot be reached counts as ready,
   * so the person sees the notice about the connection and not a key step
   * that cannot work.
   */
  state: 'checking' | 'asking' | 'ready';
  /** The account, or null before the server has answered. */
  account: GeminiAccount | null;
  /** What the server said about the last change that failed, or null. */
  fault: string | null;
  /** True while a change is with the server. */
  busy: boolean;
  /**
   * Give the server a new key.
   * @param key - The key as pasted.
   * @returns True when the server took it.
   */
  saveKey: (key: string) => Promise<boolean>;
  /**
   * Change the models or the daily limit.
   * @param change - What changes.
   */
  choose: (change: GeminiChoiceChange) => void;
  /** Leave the setup step. */
  finish: () => void;
}

/**
 * Run one change against the server.
 *
 * @param setAccount - Where the new account goes.
 * @returns The state of the change, and the function that runs one. That
 * function resolves to true when the server took the change, and never rejects:
 * a failure lands in `fault`.
 */
function useChange(setAccount: (account: GeminiAccount) => void) {
  const [fault, setFault] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const run = useCallback(
    (request: () => Promise<GeminiAccount>): Promise<boolean> => {
      setBusy(true);
      setFault(null);
      return request()
        .then((account) => {
          setAccount(account);
          return true;
        })
        .catch((error: unknown) => {
          setFault(error instanceof Error ? error.message : String(error));
          return false;
        })
        .finally(() => {
          setBusy(false);
        });
    },
    [setAccount],
  );
  return { fault, busy, run };
}

/**
 * Keep the account.
 *
 * @param open - True once the server lets this browser in. The account routes
 * are behind the access key, so nothing is read before.
 * @returns The account, where setup stands with it, and the ways to change it.
 */
export function useGemini(open: boolean): Gemini {
  const [account, setAccount] = useState<GeminiAccount | null>(null);
  const [state, setState] = useState<Gemini['state']>('checking');
  const { fault, busy, run } = useChange(setAccount);

  useEffect(() => {
    if (!open) return;
    readAccount()
      .then((read) => {
        setAccount(read);
        setState(read.key === null ? 'asking' : 'ready');
      })
      .catch(() => {
        setState('ready');
      });
  }, [open]);

  return {
    state,
    account,
    fault,
    busy,
    saveKey: useCallback((key: string) => run(() => saveKey(key)), [run]),
    choose: useCallback(
      (change: GeminiChoiceChange) => {
        void run(() => choose(change));
      },
      [run],
    ),
    finish: useCallback(() => {
      setState('ready');
    }, []),
  };
}

/**
 * List the models the stored key can use.
 *
 * @param key - The masked key, or null when there is none. A new key lists again.
 * @returns The models, newest first, or null while they are listed or when
 * there is no key. And the reason the listing failed, or null.
 */
export function useModels(key: string | null): {
  models: GeminiModels | null;
  fault: string | null;
} {
  const [models, setModels] = useState<GeminiModels | null>(null);
  const [fault, setFault] = useState<string | null>(null);

  useEffect(() => {
    setModels(null);
    setFault(null);
    if (key === null) return;
    let current = true;
    listModels()
      .then((listed) => {
        if (current) setModels(listed);
      })
      .catch((error: unknown) => {
        if (current) setFault(error instanceof Error ? error.message : String(error));
      });
    return () => {
      current = false;
    };
  }, [key]);

  return { models, fault };
}
