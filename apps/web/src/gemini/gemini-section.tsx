/**
 * The Gemini section of the settings sheet: the key, masked, with a way to
 * replace it, the two models, and the daily limit.
 */
import { ContextSizeChoice, type GeminiAccount, type Language } from '@m8/shared';
import { type FormEvent, useEffect, useState } from 'react';
import { ModelPickers } from './model-pickers.tsx';
import { GEMINI_STRINGS, type GeminiStrings } from './strings.ts';
import { type Gemini, useModels } from './use-gemini.ts';

/** What the key row needs. */
interface KeyRowProps {
  /** The account and the ways to change it. */
  gemini: Gemini;
  /** The masked key. */
  shown: string;
  /** The words. */
  strings: GeminiStrings;
}

/**
 * The masked key, and a field for a new one behind the Replace button.
 *
 * @param props - The account, the masked key and the words.
 * @returns The row, or the field while a new key is typed.
 */
function KeyRow({ gemini, shown, strings }: KeyRowProps) {
  const [replacing, setReplacing] = useState(false);
  if (replacing) {
    return (
      <NewKeyForm
        gemini={gemini}
        strings={strings}
        onCancel={() => {
          setReplacing(false);
        }}
      />
    );
  }
  return (
    <div className="m8-setting">
      <span>
        {strings.key} <code>{shown}</code>
      </span>
      <button
        type="button"
        className="m8-setting-button"
        onClick={() => {
          setReplacing(true);
        }}
      >
        {strings.replace}
      </button>
    </div>
  );
}

/** What the new key form needs. */
interface NewKeyFormProps {
  /** The account and the ways to change it. */
  gemini: Gemini;
  /** The words. */
  strings: GeminiStrings;
  /** Closes the form: on Cancel, and once the server has taken the new key. */
  onCancel: () => void;
}

/**
 * The field for a new key.
 *
 * @param props - The account, the words and the way back.
 * @returns The form.
 */
function NewKeyForm({ gemini, strings, onCancel }: NewKeyFormProps) {
  const [typed, setTyped] = useState('');

  /**
   * Send the new key on Enter as well as on the button.
   * @param event - The form's submit.
   */
  function submit(event: FormEvent): void {
    event.preventDefault();
    if (typed.trim().length < 10 || gemini.busy) return;
    void gemini.saveKey(typed.trim()).then((taken) => {
      if (taken) onCancel();
    });
  }

  return (
    <form className="m8-setting m8-setting-key" onSubmit={submit}>
      <input
        type="password"
        value={typed}
        placeholder={strings.keyPlaceholder}
        aria-label={strings.key}
        autoComplete="off"
        spellCheck={false}
        onChange={(event) => {
          setTyped(event.target.value);
        }}
      />
      <button type="submit" className="m8-setting-button m8-setting-primary" disabled={gemini.busy}>
        {gemini.busy ? strings.checking : strings.checkKey}
      </button>
      <button type="button" className="m8-setting-button" onClick={onCancel}>
        {strings.cancel}
      </button>
    </form>
  );
}

/** What the limit row needs. */
interface LimitRowProps {
  /** The account, for the limit as it is. */
  account: GeminiAccount;
  /** The account and the ways to change it. */
  gemini: Gemini;
  /** The words. */
  strings: GeminiStrings;
}

/**
 * The daily limit. It is sent when the field loses focus or on Enter, not on
 * every keystroke.
 *
 * @param props - The account, the way to change it and the words.
 * @returns The row and its hint.
 */
function LimitRow({ account, gemini, strings }: LimitRowProps) {
  const [draft, setDraft] = useState(String(account.callsPerDay));
  useEffect(() => {
    setDraft(String(account.callsPerDay));
  }, [account.callsPerDay]);

  const commit = () => {
    const callsPerDay = Number(draft);
    if (!Number.isInteger(callsPerDay) || callsPerDay < 0) {
      setDraft(String(account.callsPerDay));
      return;
    }
    if (callsPerDay !== account.callsPerDay) gemini.choose({ callsPerDay });
  };

  return (
    <>
      <label className="m8-setting">
        <span>{strings.callsPerDay}</span>
        <input
          type="number"
          min={0}
          step={1}
          inputMode="numeric"
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
          }}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') commit();
          }}
        />
      </label>
      <p className="m8-setting-hint">{strings.callsPerDayHint}</p>
    </>
  );
}

/**
 * How much of the conversation every live turn re-reads.
 *
 * @param props - The account, the way to change it and the words.
 * @returns The picker and its hint.
 */
function ContextRow({ account, gemini, strings }: LimitRowProps) {
  return (
    <>
      <label className="m8-setting">
        <span>{strings.context}</span>
        <select
          value={account.context}
          disabled={gemini.busy}
          onChange={(event) => {
            gemini.choose({ context: ContextSizeChoice.parse(event.target.value) });
          }}
        >
          {ContextSizeChoice.options.map((size) => (
            <option key={size} value={size}>
              {strings.contextSizes[size]}
            </option>
          ))}
        </select>
      </label>
      <p className="m8-setting-hint">{strings.contextHint}</p>
    </>
  );
}

/**
 * The Gemini section, in three groups: the key, the two models, and what a
 * conversation may cost.
 *
 * @param props - The account and the language the sheet is in.
 * @returns The groups, or nothing before the server has answered.
 */
export function GeminiSection({ gemini, language }: { gemini: Gemini; language: Language }) {
  const strings = GEMINI_STRINGS[language];
  const { account } = gemini;
  const { models, fault } = useModels(account?.key ?? null);
  if (!account) return null;

  return (
    <>
      {fault || gemini.fault ? (
        <p className="m8-setting-hint m8-setting-alert" role="alert">
          {gemini.fault ?? fault}
        </p>
      ) : null}
      {account.key ? (
        <section>
          <KeyRow gemini={gemini} shown={account.key} strings={strings} />
        </section>
      ) : null}
      <section>
        <ModelPickers
          account={account}
          models={models}
          busy={gemini.busy}
          strings={strings}
          onChoose={gemini.choose}
        />
      </section>
      <section>
        <ContextRow account={account} gemini={gemini} strings={strings} />
        <LimitRow account={account} gemini={gemini} strings={strings} />
      </section>
    </>
  );
}
