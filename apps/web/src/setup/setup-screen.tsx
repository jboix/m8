/** The setup screen: which language he speaks, then who is switching him on. */
import {
  LANGUAGE_NAMES,
  type Language,
  LanguageCode,
  MAX_NAME_LENGTH,
  PersonName,
  type Setup,
} from '@m8/shared';
import { type FormEvent, useState } from 'react';
import { preferredLanguage, STRINGS } from './strings.ts';

/** What the screen needs. */
interface SetupScreenProps {
  /** True while the card fades out and the eyes take the screen. */
  leaving: boolean;
  /** Called once, with the finished setup. */
  onDone: (setup: Setup) => void;
}

/** What the language step needs. */
interface LanguageStepProps {
  /** The language currently chosen, which is also the one the screen is in. */
  language: Language;
  /** Called when a card is picked. */
  onPick: (language: Language) => void;
  /** Called to move on to the name. */
  onNext: () => void;
}

/**
 * The first step: one card per language, named in its own script.
 *
 * @param props - The choice so far and what to do with a new one.
 * @returns The question, the cards and the way forward.
 */
function LanguageStep({ language, onPick, onNext }: LanguageStepProps) {
  const strings = STRINGS[language];
  return (
    <>
      <h1 className="m8-setup-ask">{strings.askLanguage}</h1>
      <div className="m8-setup-cards" role="radiogroup" aria-label={strings.askLanguage}>
        {LanguageCode.options.map((code) => (
          // biome-ignore lint/a11y/useSemanticElements: a card is a button, and a radio input cannot be styled as one.
          <button
            key={code}
            type="button"
            role="radio"
            aria-checked={code === language}
            lang={code}
            className="m8-setup-card"
            onClick={() => {
              onPick(code);
            }}
          >
            {LANGUAGE_NAMES[code].native}
          </button>
        ))}
      </div>
      <div className="m8-setup-actions">
        <button type="button" className="m8-setup-go" onClick={onNext}>
          {strings.next}
        </button>
      </div>
    </>
  );
}

/** What the name step needs. */
interface NameStepProps {
  /** The language the screen is in. */
  language: Language;
  /** The name as typed so far. */
  name: string;
  /** Called on every keystroke. */
  onName: (name: string) => void;
  /** Called to return to the languages. */
  onBack: () => void;
  /** Called with a name that validated. */
  onStart: (name: string) => void;
}

/**
 * The second step: the name he will use.
 *
 * @param props - The name so far and the ways out.
 * @returns The question, the field, the disclosure and the two buttons.
 */
function NameStep({ language, name, onName, onBack, onStart }: NameStepProps) {
  const strings = STRINGS[language];
  const valid = PersonName.safeParse(name);

  /**
   * Finish on Enter as well as on the button.
   * @param event - The form's submit.
   */
  function submit(event: FormEvent): void {
    event.preventDefault();
    if (valid.success) onStart(valid.data);
  }

  return (
    <form onSubmit={submit}>
      <h1 className="m8-setup-ask">
        <label htmlFor="m8-setup-name">{strings.askName}</label>
      </h1>
      <input
        id="m8-setup-name"
        className="m8-setup-name"
        value={name}
        maxLength={MAX_NAME_LENGTH}
        placeholder={strings.namePlaceholder}
        autoComplete="given-name"
        // biome-ignore lint/a11y/noAutofocus: the step has one field, and he has just asked for it.
        autoFocus
        onChange={(event) => {
          onName(event.target.value);
        }}
      />
      <p className="m8-setup-disclosure">{strings.disclosure}</p>
      <div className="m8-setup-actions">
        <button type="button" className="m8-setup-back" onClick={onBack}>
          {strings.back}
        </button>
        <button type="submit" className="m8-setup-go" disabled={!valid.success}>
          {strings.start}
        </button>
      </div>
    </form>
  );
}

/**
 * The setup screen.
 *
 * @remarks
 * It opens in the browser's language when that is offered, and switches the
 * moment a card is picked, so the second step is read in the language chosen in
 * the first. Nothing here asks for the camera or the microphone: the browser's
 * permission prompts wait until he is awake. The name step says where both go
 * once he is, because both are sent to the provider.
 *
 * @param props - Whether it is on its way out, and where the result goes.
 * @returns The card under the eyes.
 */
export function SetupScreen({ leaving, onDone }: SetupScreenProps) {
  const [language, setLanguage] = useState(() => preferredLanguage(navigator.languages));
  const [step, setStep] = useState<'language' | 'name'>('language');
  const [name, setName] = useState('');

  return (
    <section className="m8-setup" lang={language} data-leaving={leaving} inert={leaving}>
      {step === 'language' ? (
        <LanguageStep
          language={language}
          onPick={setLanguage}
          onNext={() => {
            setStep('name');
          }}
        />
      ) : (
        <NameStep
          language={language}
          name={name}
          onName={setName}
          onBack={() => {
            setStep('language');
          }}
          onStart={(valid) => {
            onDone({ language, name: valid });
          }}
        />
      )}
    </section>
  );
}
