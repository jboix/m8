/**
 * The Gemini account: the key, sealed in the database, which model does which
 * job, and the daily limit. Every call to Gemini asks this module for its key
 * and model, so a change takes effect on the next call.
 */
import type { Database } from 'bun:sqlite';
import {
  type GeminiAccount as AccountView,
  type ContextSize,
  DEFAULT_GEMINI_CHOICE,
  type GeminiChoice,
  type GeminiChoiceChange,
  GeminiChoiceSchema,
  type GeminiModels,
  type ModelJob,
  type UsagePurpose,
} from '@m8/shared';
import { z } from 'zod';
import type { SecretBox } from '../secrets/secret-box.ts';
import { readSetting, writeSetting } from '../settings/store.ts';
import { callsSince, openCall } from '../usage/ledger.ts';
import { listModels } from './models.ts';
import type { Fetcher } from './rest.ts';

/** The setting the sealed key is kept under. It is also the owner the key is sealed for. */
const KEY_SETTING = 'gemini.key';

/** The setting the choice is kept under. */
const CHOICE_SETTING = 'gemini.choice';

/** A day, in milliseconds. */
const DAY_MS = 86_400_000;

/** The key and model for one call. */
export interface ModelCall {
  /** The key. Server side only. */
  apiKey: string;
  /** The model id, without the `models/` prefix. */
  model: string;
  /** The call's row in the usage ledger, for its tokens once they are known. */
  usageId: number;
  /** How much of the conversation every live turn re-reads. Only a live session uses it. */
  context: ContextSize;
}

/** What a call is for, so the ledger can say where the money went. */
export interface CallPurpose {
  /** What the call is for. */
  purpose: UsagePurpose;
  /** The session it belongs to, when there is one. */
  sessionId?: number | null | undefined;
}

/** A request the account refuses because of what was asked, not because Gemini failed. */
export class AccountRefusal extends Error {
  /**
   * Build the refusal.
   *
   * @param message - What was wrong, in words the person can act on.
   */
  constructor(message: string) {
    super(message);
    this.name = 'AccountRefusal';
  }
}

/** The account. */
export interface GeminiAccount {
  /** What the browser may see: the key masked, the models, the limit. */
  view(): Promise<AccountView>;
  /**
   * Check a key with Gemini, then store it. A model that the key cannot use
   * is replaced with the newest that it can.
   * @param key - The key as pasted.
   * @returns The new view.
   */
  setKey(key: string): Promise<AccountView>;
  /**
   * Change which model does which job, or the daily limit.
   * @param change - What changes. A model must be one the key can use.
   * @returns The new view.
   */
  choose(change: GeminiChoiceChange): Promise<AccountView>;
  /** The models the stored key can use, newest first. */
  models(): Promise<GeminiModels>;
  /**
   * The key and model for one call, recorded in the usage ledger and counted
   * against the daily limit.
   * @param job - Which model the call needs.
   * @param why - What the call is for, and its session.
   * @returns The key, the model and the call's row in the ledger.
   */
  forCall(job: ModelJob, why: CallPurpose): Promise<ModelCall>;
}

/** What the account is built from. */
export interface AccountDeps {
  /** Where the key and the choice are kept. */
  db: Database;
  /** Seals and opens the key. */
  box: SecretBox;
  /** The fetch the model listing uses. */
  fetcher: Fetcher;
  /** The clock. */
  now: () => number;
}

/**
 * Show the end of a key and nothing else.
 *
 * @param key - The key.
 * @returns Eight dots and its last four characters.
 */
function mask(key: string): string {
  return `••••••••${key.slice(-4)}`;
}

/**
 * Keep a model the key can still use, or take the newest one.
 *
 * @param current - The model chosen before, or null.
 * @param available - What the key can use, newest first.
 * @returns The model to use, or null when the key can use none of this kind.
 */
function keepOrNewest(current: string | null, available: GeminiModels['live']): string | null {
  if (current && available.some((model) => model.id === current)) return current;
  return available[0]?.id ?? null;
}

/**
 * The stored choice.
 *
 * @param db - The database.
 * @returns The choice, or the default before there is one.
 */
function readChoice(db: Database): GeminiChoice {
  return readSetting(db, CHOICE_SETTING, GeminiChoiceSchema) ?? DEFAULT_GEMINI_CHOICE;
}

/**
 * The stored key, opened.
 *
 * @param deps - The database and the secret box.
 * @returns The key, or null when there is none.
 */
async function readKey(deps: AccountDeps): Promise<string | null> {
  const sealed = readSetting(deps.db, KEY_SETTING, z.string());
  return sealed === null ? null : deps.box.open(sealed, KEY_SETTING);
}

/**
 * The stored key, when there must be one.
 *
 * @param deps - The database and the secret box.
 * @returns The key.
 * @throws {AccountRefusal} When there is none.
 */
async function requireKey(deps: AccountDeps): Promise<string> {
  const key = await readKey(deps);
  if (key === null)
    throw new AccountRefusal('There is no Gemini key yet. Add one in the settings.');
  return key;
}

/**
 * What the browser may see.
 *
 * @param deps - The database and the secret box.
 * @returns The choice and the masked key.
 */
async function viewOf(deps: AccountDeps): Promise<AccountView> {
  const key = await readKey(deps);
  return { ...readChoice(deps.db), key: key === null ? null : mask(key) };
}

/**
 * Check a key with Gemini, store it, and keep the chosen models it can use.
 *
 * @param deps - The database, the secret box, the fetch and the clock.
 * @param key - The key as pasted.
 * @throws {GeminiError} When Gemini refuses the key. Nothing is stored then.
 */
async function storeKey(deps: AccountDeps, key: string): Promise<void> {
  const available = await listModels(deps.fetcher, key);
  const before = readChoice(deps.db);
  writeSetting(deps.db, KEY_SETTING, await deps.box.seal(key, KEY_SETTING), deps.now());
  const after = {
    ...before,
    live: keepOrNewest(before.live, available.live),
    memory: keepOrNewest(before.memory, available.text),
  };
  writeSetting(deps.db, CHOICE_SETTING, after, deps.now());
}

/**
 * Refuse a change that names a model the key cannot use.
 *
 * @param deps - The database, the secret box and the fetch.
 * @param change - The change.
 * @throws {AccountRefusal} When a named model is not in the key's list.
 */
async function checkModels(deps: AccountDeps, change: GeminiChoiceChange): Promise<void> {
  if (change.live === undefined && change.memory === undefined) return;
  const available = await listModels(deps.fetcher, await requireKey(deps));
  const has = (models: GeminiModels['live'], id: string) => models.some((model) => model.id === id);
  if (change.live !== undefined && !has(available.live, change.live)) {
    throw new AccountRefusal(`${change.live} is not a live model this key can use.`);
  }
  if (change.memory !== undefined && !has(available.text, change.memory)) {
    throw new AccountRefusal(`${change.memory} is not a text model this key can use.`);
  }
}

/**
 * Refuse a call when the calls allowed in the last 24 hours are spent.
 *
 * @param deps - The database and the clock.
 * @param limit - The calls allowed in any 24 hours. 0 refuses nothing.
 * @throws {AccountRefusal} When the limit is reached.
 */
function checkDailyLimit(deps: AccountDeps, limit: number): void {
  if (limit === 0 || callsSince(deps.db, deps.now() - DAY_MS) < limit) return;
  throw new AccountRefusal(
    `He has made ${limit} calls to Gemini in the last 24 hours, which is the limit. You can raise it in the settings.`,
  );
}

/**
 * Build the account.
 *
 * @param deps - The database, the secret box, the fetch and the clock.
 * @returns The account.
 */
export function createGeminiAccount(deps: AccountDeps): GeminiAccount {
  return {
    view: () => viewOf(deps),
    async setKey(key) {
      await storeKey(deps, key);
      return viewOf(deps);
    },
    async choose(change) {
      await checkModels(deps, change);
      writeSetting(deps.db, CHOICE_SETTING, { ...readChoice(deps.db), ...change }, deps.now());
      return viewOf(deps);
    },
    models: async () => listModels(deps.fetcher, await requireKey(deps)),
    async forCall(job, why) {
      const apiKey = await requireKey(deps);
      const choice = readChoice(deps.db);
      const model = choice[job];
      if (!model)
        throw new AccountRefusal(`No model is chosen for ${job}. Choose one in the settings.`);
      checkDailyLimit(deps, choice.callsPerDay);
      const usageId = openCall(deps.db, { at: deps.now(), model, ...why });
      return { apiKey, model, usageId, context: choice.context };
    },
  };
}
