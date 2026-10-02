/**
 * A word by word diff of two short texts, for reading how the self-model
 * changed between versions. Our own few lines, since the texts are a few
 * hundred words and the project takes no dependency it can do without.
 */

/** A run of words that were kept, added or removed. */
export interface DiffPart {
  /** What happened to the run. */
  kind: 'same' | 'added' | 'removed';
  /** The words, joined with single spaces. */
  text: string;
}

/**
 * Read a cell of the table, treating everything past its edges as zero.
 *
 * @param table - The table.
 * @param i - The row.
 * @param j - The column.
 * @returns The cell, or 0 outside the table.
 */
function at(table: number[][], i: number, j: number): number {
  return table[i]?.[j] ?? 0;
}

/**
 * The longest common subsequence table of two word lists.
 *
 * @param before - The old words.
 * @param after - The new words.
 * @returns A table where cell `i, j` is the most words `before` from `i` and
 * `after` from `j` share, in order.
 */
function commonLengths(before: string[], after: string[]): number[][] {
  const table = before.map(() => new Array<number>(after.length).fill(0));
  for (let i = before.length - 1; i >= 0; i--) {
    for (let j = after.length - 1; j >= 0; j--) {
      (table[i] as number[])[j] =
        before[i] === after[j]
          ? at(table, i + 1, j + 1) + 1
          : Math.max(at(table, i + 1, j), at(table, i, j + 1));
    }
  }
  return table;
}

/**
 * Add one word to a diff, extending the last run when it is the same kind.
 *
 * @param parts - The diff so far. Changed in place.
 * @param kind - What happened to the word.
 * @param word - The word.
 */
function push(parts: DiffPart[], kind: DiffPart['kind'], word: string): void {
  const last = parts.at(-1);
  if (last?.kind === kind) last.text += ` ${word}`;
  else parts.push({ kind, text: word });
}

/** Where a comparison has got to in both word lists. */
interface Cursor {
  /** The old words. */
  old: string[];
  /** The new words. */
  next: string[];
  /** How many old words are behind it. */
  i: number;
  /** How many new words are behind it. */
  j: number;
}

/**
 * Decide what the word under the cursor is.
 *
 * @param cursor - Where the comparison has got to.
 * @param table - The common lengths, from {@link commonLengths}.
 * @returns `same` when both lists continue with it, otherwise whichever of
 * removing or adding keeps the most words in common afterwards.
 */
function kindAt({ old, next, i, j }: Cursor, table: number[][]): DiffPart['kind'] {
  if (i < old.length && old[i] === next[j]) return 'same';
  if (j >= next.length) return 'removed';
  if (i >= old.length) return 'added';
  return at(table, i + 1, j) >= at(table, i, j + 1) ? 'removed' : 'added';
}

/**
 * Compare two texts word by word.
 *
 * @param before - The old text.
 * @param after - The new text.
 * @returns The runs that make up both, in reading order. Removed runs come
 * before the added runs that replaced them.
 */
export function diffWords(before: string, after: string): DiffPart[] {
  const cursor: Cursor = {
    old: before.split(/\s+/).filter(Boolean),
    next: after.split(/\s+/).filter(Boolean),
    i: 0,
    j: 0,
  };
  const table = commonLengths(cursor.old, cursor.next);
  const parts: DiffPart[] = [];

  while (cursor.i < cursor.old.length || cursor.j < cursor.next.length) {
    const kind = kindAt(cursor, table);
    push(parts, kind, (kind === 'added' ? cursor.next[cursor.j] : cursor.old[cursor.i]) as string);
    if (kind !== 'added') cursor.i++;
    if (kind !== 'removed') cursor.j++;
  }
  return parts;
}
