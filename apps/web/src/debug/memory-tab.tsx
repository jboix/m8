/**
 * The memory tab: how he describes himself and how that has changed, what each
 * session came to, and the facts he keeps. Section 12 of docs/architecture.md.
 */
import type { Episode, Fact, SelfModelVersion } from '@m8/shared';
import { useState } from 'react';
import { type MemoryView, useMemory } from '../memory/use-memory.ts';
import { diffWords } from './text-diff.ts';

/**
 * Write a moment as a short local date and time.
 *
 * @param when - Milliseconds since the epoch.
 * @returns For example `21 Sept, 14:05`.
 */
function shortDate(when: number): string {
  return new Date(when).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** What the version picker needs. */
interface VersionPickerProps {
  /** Every version, newest first. */
  versions: SelfModelVersion[];
  /** The version on show. */
  shown: number;
  /** Shows another. */
  onPick: (version: number) => void;
}

/**
 * One chip per self-model version.
 *
 * @param props - The versions, the one on show, and the way to show another.
 * @returns The chips, newest first.
 */
function VersionPicker({ versions, shown, onPick }: VersionPickerProps) {
  return (
    <div className="m8-chips m8-chips-scroll">
      {versions.map((row) => (
        <button
          key={row.version}
          type="button"
          className={row.version === shown ? 'm8-pin-on' : ''}
          title={shortDate(row.createdAt)}
          onClick={() => {
            onPick(row.version);
          }}
        >
          v{row.version}
        </button>
      ))}
    </div>
  );
}

/**
 * One self-model version, as a diff against the one before it.
 *
 * @param props - The text before and the text on show.
 * @returns The text, with what was added lit and what was removed struck out.
 */
function VersionDiff({ before, after }: { before: string; after: string }) {
  return (
    <p className="m8-diff">
      {diffWords(before, after).map((part, position) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: a diff is rebuilt whole, and its runs have no identity but their place.
        <span key={position} className={`m8-diff-${part.kind}`}>
          {part.text}{' '}
        </span>
      ))}
    </p>
  );
}

/** What the self-model section needs. */
interface SelfModelProps {
  /** Every version, newest first. */
  versions: SelfModelVersion[];
  /** Makes an older version current. */
  onRollBack: (version: number) => void;
}

/**
 * The self-model: one version at a time, shown as a diff against the one before it.
 *
 * @param props - The versions, and the way back to one.
 * @returns A version picker, the diff, and the rollback button on every version but the newest.
 */
function SelfModel({ versions, onRollBack }: SelfModelProps) {
  const [picked, setPicked] = useState<number | null>(null);
  const newest = versions[0];
  if (!newest)
    return <p className="m8-detail">no self-model yet: it is written after an episode</p>;

  const index = Math.max(
    0,
    versions.findIndex((row) => row.version === picked),
  );
  const shown = versions[index] ?? newest;
  const cause = shown.fromEpisode === null ? 'a rollback' : `after episode ${shown.fromEpisode}`;
  return (
    <>
      <VersionPicker versions={versions} shown={shown.version} onPick={setPicked} />
      <VersionDiff before={versions[index + 1]?.body ?? ''} after={shown.body} />
      <div className="m8-chips">
        <span className="m8-detail">
          {shortDate(shown.createdAt)}, {cause}
        </span>
        {shown.version === newest.version ? null : (
          <button type="button" className="m8-pin" onClick={() => onRollBack(shown.version)}>
            roll back to v{shown.version}
          </button>
        )}
      </div>
    </>
  );
}

/**
 * What each session came to.
 *
 * @param props - The episodes, newest first.
 * @returns The list, or a line saying there is none.
 */
function Episodes({ episodes }: { episodes: Episode[] }) {
  if (episodes.length === 0) return <p className="m8-detail">no episodes yet</p>;
  return (
    <ol className="m8-transcript m8-memory-list">
      {episodes.map((episode) => (
        <li key={episode.id} className="m8-said">
          <span className="m8-age">
            {episode.id}, {shortDate(episode.createdAt)}
          </span>{' '}
          {episode.summary}
        </li>
      ))}
    </ol>
  );
}

/** What the facts section needs. */
interface FactsProps {
  /** The current facts, most important first. */
  facts: Fact[];
  /** Deletes one for good. */
  onForget: (id: number) => void;
}

/**
 * The facts he keeps.
 *
 * @param props - The facts, and the way to delete one.
 * @returns The list, or a line saying there is none.
 */
function Facts({ facts, onForget }: FactsProps) {
  if (facts.length === 0) return <p className="m8-detail">no facts yet</p>;
  return (
    <ol className="m8-transcript m8-memory-list">
      {facts.map((fact) => (
        <li key={fact.id} className="m8-said m8-fact">
          <span>
            <span className="m8-kind">
              {fact.kind} {'★'.repeat(fact.importance)}
            </span>{' '}
            {fact.text}{' '}
            <span className="m8-age">
              {fact.source}, recalled {fact.useCount}×
            </span>
          </span>
          <button
            type="button"
            aria-label={`Forget: ${fact.text}`}
            onClick={() => {
              onForget(fact.id);
            }}
          >
            forget
          </button>
        </li>
      ))}
    </ol>
  );
}

/**
 * The three sections, once the memory has been read.
 *
 * @param props - The view of the memory.
 * @returns The self-model, the episodes and the facts.
 */
function Remembered({ memory }: { memory: MemoryView }) {
  if (!memory.snapshot) return null;
  const { selfModel, episodes, facts } = memory.snapshot;
  return (
    <>
      <p className="m8-label">self-model, {selfModel.length} versions</p>
      <SelfModel versions={selfModel} onRollBack={memory.rollBack} />
      <p className="m8-label">episodes, {episodes.length}</p>
      <Episodes episodes={episodes} />
      <p className="m8-label">facts, {facts.length}</p>
      <Facts facts={facts} onForget={memory.forget} />
    </>
  );
}

/**
 * The memory tab.
 *
 * @param props - Whether the tab is the open one, which is when the memory is read.
 * @returns The tab.
 */
export function MemoryTab({ open }: { open: boolean }) {
  const memory = useMemory(open);
  return (
    <>
      <div className="m8-chips">
        <button type="button" onClick={memory.refresh}>
          read again
        </button>
        <span className={memory.fault ? 'm8-fault' : 'm8-detail'}>
          {memory.fault ?? 'a session becomes an episode a few seconds after it ends'}
        </span>
      </div>
      <Remembered memory={memory} />
    </>
  );
}
