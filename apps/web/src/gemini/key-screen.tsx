/**
 * The setup step for Gemini: the key, then the two models. It comes after the
 * access key and before the language, and only when the server has no key.
 */
import type { Language } from '@m8/shared';
import { type FormEvent, useState } from 'react';
import { preferredLanguage } from '../setup/strings.ts';
import { ModelPickers } from './model-pickers.tsx';
import { GEMINI_STRINGS } from './strings.ts';
import { type Gemini, useModels } from './use-gemini.ts';

/**
 * The key step.
 *
 * @remarks
 * It comes before the language is chosen, so it is written in the browser's
 * language when he speaks it, like the access key screen. Once Gemini has
 * accepted the key, the same card asks for the models, with the newest of each
 * already chosen.
 *
 * @param props - The account and the ways to change it.
 * @returns The card under the eyes.
 */
export function KeyScreen({ gemini }: { gemini: Gemini }) {
  const language = preferredLanguage(navigator.languages);
  const strings = GEMINI_STRINGS[language];
  const key = gemini.account?.key ?? null;

  return (
    <section className="m8-setup" lang={language}>
      {key === null ? (
        <KeyForm gemini={gemini} language={language} />
      ) : (
        <div className="m8-setup-models">
          <h1 className="m8-setup-ask">{strings.askModels}</h1>
          <Models gemini={gemini} keyShown={key} language={language} />
          <div className="m8-setup-actions">
            <button
              type="button"
              className="m8-setup-go"
              disabled={gemini.busy}
              onClick={gemini.finish}
            >
              {strings.next}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

/** What the key form and the model pickers need. */
interface StepProps {
  /** The account and the ways to change it. */
  gemini: Gemini;
  /** The language the card is in. */
  language: Language;
}

/**
 * The key field and the button that checks it.
 *
 * @param props - The account and the language.
 * @returns The form.
 */
function KeyForm({ gemini, language }: StepProps) {
  const strings = GEMINI_STRINGS[language];
  const [typed, setTyped] = useState('');
  const ready = typed.trim().length >= 10 && !gemini.busy;

  /**
   * Check the key on Enter as well as on the button.
   * @param event - The form's submit.
   */
  function submit(event: FormEvent): void {
    event.preventDefault();
    if (ready) void gemini.saveKey(typed.trim());
  }

  return (
    <form onSubmit={submit}>
      <h1 className="m8-setup-ask">
        <label htmlFor="m8-gemini-key">{strings.askKey}</label>
      </h1>
      <input
        id="m8-gemini-key"
        className="m8-setup-name"
        type="password"
        value={typed}
        placeholder={strings.keyPlaceholder}
        autoComplete="off"
        spellCheck={false}
        onChange={(event) => {
          setTyped(event.target.value);
        }}
      />
      {gemini.fault ? (
        <p className="m8-setup-disclosure" role="alert">
          {gemini.fault}
        </p>
      ) : null}
      <p className="m8-setup-disclosure">{strings.keyHint}</p>
      <div className="m8-setup-actions">
        <button type="submit" className="m8-setup-go" disabled={!ready}>
          {gemini.busy ? strings.checking : strings.checkKey}
        </button>
      </div>
    </form>
  );
}

/**
 * The two pickers, with the models the new key can use.
 *
 * @param props - The account, the masked key the list is for, and the language.
 * @returns The pickers, and why the list did not come when it did not.
 */
function Models({ gemini, keyShown, language }: StepProps & { keyShown: string }) {
  const strings = GEMINI_STRINGS[language];
  const { models, fault } = useModels(keyShown);
  if (!gemini.account) return null;
  return (
    <>
      <ModelPickers
        account={gemini.account}
        models={models}
        busy={gemini.busy}
        strings={strings}
        onChoose={gemini.choose}
      />
      {models === null && !fault ? (
        <p className="m8-setting-hint">{strings.loadingModels}</p>
      ) : null}
      {fault || gemini.fault ? (
        <p className="m8-setup-disclosure" role="alert">
          {fault ?? gemini.fault}
        </p>
      ) : null}
    </>
  );
}
