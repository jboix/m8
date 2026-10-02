/**
 * The faces section of the settings sheet: the switch that lets him learn
 * faces, a button that teaches him yours, and the faces he knows with a way to
 * forget each.
 */
import type { KnownFace, Language, Settings } from '@m8/shared';
import { useState } from 'react';
import type { KnownFacesView } from '../memory/use-known-faces.ts';
import type { Learnable } from '../senses/vision/derive.ts';
import { SwitchRow } from './rows.tsx';
import { SETTINGS_STRINGS } from './strings.ts';

/** What the section needs. */
export interface FacesSectionProps {
  /** The language the section is written in. */
  language: Language;
  /** The name from setup, which "learn my face" stores the face under. */
  name: string;
  /** Whether he learns faces. */
  knowsFaces: boolean;
  /** Changes the switch. */
  onSettings: (change: Partial<Settings>) => void;
  /** The faces he knows and the ways to change them. */
  faces: KnownFacesView;
  /** The face in front of the camera, ready to learn, and how many faces are in view. */
  faceToLearn: () => Learnable;
}

/**
 * The people he knows, each once, with how many looks he has had at them.
 *
 * @param faces - Every stored face.
 * @returns One entry per name, in the order first met.
 */
function byName(faces: KnownFace[]): { name: string; ids: number[] }[] {
  const people = new Map<string, number[]>();
  for (const face of [...faces].reverse()) {
    people.set(face.name, [...(people.get(face.name) ?? []), face.id]);
  }
  return [...people.entries()].map(([name, ids]) => ({ name, ids }));
}

/**
 * The people he knows, with a way to forget each.
 *
 * @param props - The language and the faces.
 * @returns The list, or a line saying it is empty.
 */
function KnownList({ language, faces }: Pick<FacesSectionProps, 'language' | 'faces'>) {
  const strings = SETTINGS_STRINGS[language];
  if (faces.known.length === 0) return <p className="m8-setting-hint">{strings.knowsNobody}</p>;
  return (
    <ul className="m8-setting-facts">
      {byName(faces.known).map((person) => (
        <li key={person.name}>
          <span>
            {person.name} ({person.ids.length})
          </span>
          <button
            type="button"
            className="m8-setting-button"
            onClick={() => {
              for (const id of person.ids) faces.forget(id);
            }}
          >
            {strings.forget}
          </button>
        </li>
      ))}
    </ul>
  );
}

/**
 * The faces section.
 *
 * @param props - The switch, the faces, and the ways to change them.
 * @returns The switch, and while it is on, the faces he knows and the button that teaches him yours.
 */
export function FacesSection(props: FacesSectionProps) {
  const { language, name, knowsFaces, onSettings, faces, faceToLearn } = props;
  const strings = SETTINGS_STRINGS[language];
  const [missed, setMissed] = useState<'nobody' | 'notYet' | null>(null);

  const learnMine = () => {
    const { embedding, inView } = faceToLearn();
    if (embedding) {
      faces.learn(name, embedding);
      setMissed(null);
      return;
    }
    setMissed(inView > 0 ? 'notYet' : 'nobody');
  };

  return (
    <>
      <section>
        <SwitchRow
          label={strings.knowsFaces}
          on={knowsFaces}
          onChange={(next) => onSettings({ knowsFaces: next })}
        />
        <p className="m8-setting-hint">{strings.knowsFacesHint}</p>
      </section>
      {knowsFaces ? (
        <section>
          <h3>{strings.knownFaces}</h3>
          <KnownList language={language} faces={faces} />
          <button
            type="button"
            className="m8-setting-button m8-setting-primary"
            onClick={learnMine}
          >
            {strings.learnMyFace}
          </button>
          {missed === 'nobody' ? <p className="m8-setting-hint">{strings.noFaceToLearn}</p> : null}
          {missed === 'notYet' ? <p className="m8-setting-hint">{strings.faceNotYet}</p> : null}
          {faces.fault ? <p className="m8-setting-hint">{strings.memoryFault}</p> : null}
        </section>
      ) : null}
    </>
  );
}
