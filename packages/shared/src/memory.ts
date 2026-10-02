/**
 * What the character remembers, as the server hands it to the debug panel.
 * Section 9 of docs/architecture.md.
 *
 * The tables are the server's business. These are the rows as they cross to the
 * browser, which only ever reads them, forgets a fact, or rolls the self-model
 * back.
 */
import { z } from 'zod';
import { FactKind } from './tools.ts';

/** Milliseconds since the Unix epoch. */
const When = z.number().int().nonnegative();

/** One durable memory. */
export const Fact = z.object({
  id: z.number().int(),
  kind: FactKind,
  text: z.string(),
  /** 1 barely worth keeping, 5 never forget. */
  importance: z.number().int().min(1).max(5),
  createdAt: When,
  /** When `recall` last found it, or null when never. */
  lastUsedAt: When.nullable(),
  /** How many times `recall` has found it. */
  useCount: z.number().int().nonnegative(),
  /** Where it came from: the model's own `remember`, or the summarizer. */
  source: z.enum(['tool', 'summarizer']),
});

/** One durable memory. */
export type Fact = z.infer<typeof Fact>;

/** What one session came to. */
export const Episode = z.object({
  id: z.number().int(),
  sessionId: z.number().int(),
  summary: z.string(),
  createdAt: When,
});

/** What one session came to. */
export type Episode = z.infer<typeof Episode>;

/** One version of how he describes himself. */
export const SelfModelVersion = z.object({
  version: z.number().int(),
  body: z.string(),
  createdAt: When,
  /** The episode that prompted it, or null for a rollback. */
  fromEpisode: z.number().int().nullable(),
});

/** One version of how he describes himself. */
export type SelfModelVersion = z.infer<typeof SelfModelVersion>;

/** How many values the face embedder gives. Fixed by the model. */
export const FACE_EMBEDDING_SIZE = 256;

/** One embedding of a face, as a unit vector. */
const FaceEmbedding = z.array(z.number().min(-1).max(1)).length(FACE_EMBEDDING_SIZE);

/** A face he knows: whose it is, and the embedding to match against. */
export const KnownFace = z.object({
  id: z.number().int(),
  name: z.string().min(1).max(60),
  embedding: FaceEmbedding,
  createdAt: When,
});

/** A face he knows. */
export type KnownFace = z.infer<typeof KnownFace>;

/** A face to learn, sent by the browser. */
export const FaceToLearn = z.object({
  name: z.string().trim().min(1).max(60),
  embedding: FaceEmbedding,
});

/** A face to learn. */
export type FaceToLearn = z.infer<typeof FaceToLearn>;

/** Everything he knows by sight. The answer to the faces route. */
export const KnownFaces = z.array(KnownFace);

/** Everything the memory browser shows. */
export const MemorySnapshot = z.object({
  facts: z.array(Fact),
  episodes: z.array(Episode),
  /** Newest first. */
  selfModel: z.array(SelfModelVersion),
  /** Every face he knows, newest first. */
  faces: z.array(KnownFace),
});

/** Everything the memory browser shows. */
export type MemorySnapshot = z.infer<typeof MemorySnapshot>;

/** A request to make an older self-model the current one. */
export const SelfModelRollback = z.object({ version: z.number().int().positive() });

/** A request to make an older self-model the current one. */
export type SelfModelRollback = z.infer<typeof SelfModelRollback>;
