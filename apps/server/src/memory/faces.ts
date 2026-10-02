/**
 * The faces he knows. Each row is one embedding of one person's face, taken in
 * the browser and matched there. The server only keeps them, and never sees a
 * picture.
 */
import type { Database } from 'bun:sqlite';
import { FACE_EMBEDDING_SIZE, type KnownFace } from '@m8/shared';

/** How many embeddings one person keeps. The newest replace the oldest. */
const FACES_PER_PERSON = 5;

/** A row of the faces table, with the embedding still packed. */
interface FaceRow {
  id: number;
  name: string;
  embedding: Uint8Array;
  createdAt: number;
}

/**
 * Unpack a stored embedding.
 *
 * @param bytes - The blob.
 * @returns The values.
 */
function unpack(bytes: Uint8Array): number[] {
  const copy = new Float32Array(bytes.slice().buffer);
  return Array.from(copy);
}

/**
 * Pack an embedding for storage.
 *
 * @param embedding - The values.
 * @returns The blob.
 */
function pack(embedding: number[]): Uint8Array {
  return new Uint8Array(Float32Array.from(embedding).buffer);
}

/**
 * Every face he knows, newest first.
 *
 * @param db - The memory.
 * @returns The faces, with their embeddings.
 */
export function knownFaces(db: Database): KnownFace[] {
  return db
    .query<FaceRow, []>(
      'SELECT id, name, embedding, created_at AS createdAt FROM faces ORDER BY id DESC',
    )
    .all()
    .map((row) => ({ ...row, embedding: unpack(row.embedding) }))
    .filter((face) => face.embedding.length === FACE_EMBEDDING_SIZE);
}

/**
 * The names he knows by sight, each once.
 *
 * @param db - The memory.
 * @returns The names, in the order they were first learned.
 */
export function knownNames(db: Database): string[] {
  return db
    .query<{ name: string }, []>('SELECT name FROM faces GROUP BY name ORDER BY MIN(id)')
    .all()
    .map((row) => row.name);
}

/**
 * Learn one more embedding of a person's face. Past the limit, their oldest
 * one goes.
 *
 * @param db - The memory.
 * @param name - Whose face.
 * @param embedding - The embedding.
 * @param now - When.
 * @returns The new row's id.
 */
export function learnFace(db: Database, name: string, embedding: number[], now: number): number {
  return db.transaction(() => {
    const { id } = db
      .query<{ id: number }, [string, Uint8Array, number]>(
        'INSERT INTO faces (name, embedding, created_at) VALUES (?, ?, ?) RETURNING id',
      )
      .get(name, pack(embedding), now) ?? { id: 0 };
    db.run(
      `DELETE FROM faces WHERE name = ? AND id NOT IN (
         SELECT id FROM faces WHERE name = ? ORDER BY id DESC LIMIT ?)`,
      [name, name, FACES_PER_PERSON],
    );
    return id;
  })();
}

/**
 * Forget one stored face.
 *
 * @param db - The memory.
 * @param id - Which row.
 * @returns True when there was one to forget.
 */
export function forgetFace(db: Database, id: number): boolean {
  return db.run('DELETE FROM faces WHERE id = ?', [id]).changes > 0;
}
