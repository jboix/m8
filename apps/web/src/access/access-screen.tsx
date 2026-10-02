/** The key screen: the card under the eyes that asks for the access key. */
import { type FormEvent, useState } from 'react';
import { preferredLanguage } from '../setup/strings.ts';
import { ACCESS_STRINGS } from './strings.ts';
import type { Access } from './use-access.ts';

/**
 * The key screen.
 *
 * @remarks
 * It comes before setup, so there is no chosen language yet. It is written in
 * the browser's, when that is one he speaks.
 *
 * @param props - The last fault, and the way to give the key.
 * @returns The card under the eyes.
 */
export function AccessScreen({ fault, unlock }: Pick<Access, 'fault' | 'unlock'>) {
  const [key, setKey] = useState('');
  const language = preferredLanguage(navigator.languages);
  const strings = ACCESS_STRINGS[language];

  /**
   * Give the key on Enter as well as on the button.
   * @param event - The form's submit.
   */
  function submit(event: FormEvent): void {
    event.preventDefault();
    if (key.length > 0) unlock(key);
  }

  return (
    <section className="m8-setup" lang={language}>
      <form onSubmit={submit}>
        <h1 className="m8-setup-ask">
          <label htmlFor="m8-access-key">{strings.ask}</label>
        </h1>
        <input
          id="m8-access-key"
          className="m8-setup-name"
          type="password"
          value={key}
          placeholder={strings.placeholder}
          autoComplete="current-password"
          onChange={(event) => {
            setKey(event.target.value);
          }}
        />
        {fault ? (
          <p className="m8-setup-disclosure" role="alert">
            {strings[fault]}
          </p>
        ) : null}
        <div className="m8-setup-actions">
          <button type="submit" className="m8-setup-go" disabled={key.length === 0}>
            {strings.unlock}
          </button>
        </div>
      </form>
    </section>
  );
}
