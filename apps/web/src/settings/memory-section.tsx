/**
 * The memory section of the settings sheet: what he remembers, a way to forget
 * one thing, and a way to forget all of it.
 */
import type { Language } from '@m8/shared';
import { useState } from 'react';
import { useMemory } from '../memory/use-memory.ts';
import { SETTINGS_STRINGS } from './strings.ts';

/** What the section needs. */
interface MemorySectionProps {
  /** The language the section is written in. */
  language: Language;
}

/** What the forget-everything button needs. */
interface ForgetAllProps {
  /** The language it is written in. */
  language: Language;
  /** Deletes every memory. */
  onForgetAll: () => void;
}

/**
 * The button that deletes everything. It has to be pressed twice, because there
 * is no way back.
 *
 * @param props - The language and what to call on the second press.
 * @returns The button.
 */
function ForgetAll({ language, onForgetAll }: ForgetAllProps) {
  const [armed, setArmed] = useState(false);
  const strings = SETTINGS_STRINGS[language];
  return (
    <button
      type="button"
      className="m8-setting-button m8-setting-danger"
      onClick={() => {
        if (armed) onForgetAll();
        setArmed(!armed);
      }}
    >
      {armed ? strings.forgetAllConfirm : strings.forgetAll}
    </button>
  );
}

/**
 * The memory section.
 *
 * @remarks
 * The sheet is mounted only while it is open, so the memory is read on mount
 * and the list starts folded every time.
 *
 * @param props - The language.
 * @returns The count, the facts with a way to forget each, and the way to forget everything.
 */
export function MemorySection({ language }: MemorySectionProps) {
  const memory = useMemory(true);
  const strings = SETTINGS_STRINGS[language];
  const facts = memory.snapshot?.facts ?? [];
  const [shown, setShown] = useState(false);

  if (memory.fault) return <p className="m8-setting-hint">{strings.memoryFault}</p>;
  if (facts.length === 0) return <p className="m8-setting-hint">{strings.remembersNothing}</p>;
  return (
    <>
      <button
        type="button"
        className="m8-setting-disclose"
        aria-expanded={shown}
        onClick={() => {
          setShown(!shown);
        }}
      >
        {strings.remembers.replace('{count}', String(facts.length))}
      </button>
      {shown ? (
        <ul className="m8-setting-facts">
          {facts.map((fact) => (
            <li key={fact.id}>
              <span>{fact.text}</span>
              <button
                type="button"
                className="m8-setting-button"
                onClick={() => memory.forget(fact.id)}
              >
                {strings.forget}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <ForgetAll language={language} onForgetAll={memory.forgetAll} />
    </>
  );
}
