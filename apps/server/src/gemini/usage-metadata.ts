/**
 * Gemini's `usageMetadata`, read into the counts the ledger keeps. The text
 * endpoint and the Live API report the same thing with different names for
 * the output: `candidates` for text, `response` for live.
 */
import { NO_TOKENS, type TokenCounts } from '@m8/shared';
import { z } from 'zod';

/** Tokens of one modality. */
const ModalityCount = z.object({ modality: z.string(), tokenCount: z.number().default(0) });

/** A list of counts by modality. */
const ByModality = z.array(ModalityCount).default([]);

/** The part of `usageMetadata` read here. Everything is optional, because a reply may omit any of it. */
export const UsageMetadata = z.object({
  promptTokenCount: z.number().default(0),
  promptTokensDetails: ByModality,
  cachedContentTokenCount: z.number().default(0),
  cacheTokensDetails: ByModality,
  candidatesTokenCount: z.number().default(0),
  candidatesTokensDetails: ByModality,
  responseTokenCount: z.number().default(0),
  responseTokensDetails: ByModality,
  thoughtsTokenCount: z.number().default(0),
});

/** The part of `usageMetadata` read here. */
type UsageMetadata = z.infer<typeof UsageMetadata>;

/** Text, audio and image, which is how Gemini prices input. */
type Split = { text: number; audio: number; image: number };

/**
 * Sum counts by the modality Gemini prices them as.
 *
 * @param details - The counts by modality.
 * @returns Text, audio and image. Video is priced as image. Anything Gemini
 * adds later is counted as text, the cheapest guess that still counts it.
 */
function split(details: z.infer<typeof ByModality>): Split {
  const sum: Split = { text: 0, audio: 0, image: 0 };
  for (const { modality, tokenCount } of details) {
    if (modality === 'AUDIO') sum.audio += tokenCount;
    else if (modality === 'IMAGE' || modality === 'VIDEO') sum.image += tokenCount;
    else sum.text += tokenCount;
  }
  return sum;
}

/**
 * Make a split add up to a total. Gemini's details can fall a few tokens short
 * of the total it reports, and the total is what it charges.
 *
 * @param parts - The split.
 * @param total - The total.
 * @returns The split, with what is missing added to text.
 */
function topUp(parts: Split, total: number): Split {
  const missing = total - parts.text - parts.audio - parts.image;
  return missing > 0 ? { ...parts, text: parts.text + missing } : parts;
}

/**
 * Read the input side: fresh tokens and cached tokens by modality.
 *
 * @param usage - The metadata.
 * @returns The input counts. Cached tokens are taken out of the fresh ones,
 * because the prompt count includes them.
 */
function inputOf(usage: UsageMetadata): Partial<TokenCounts> {
  const prompt = topUp(split(usage.promptTokensDetails), usage.promptTokenCount);
  const cached = topUp(split(usage.cacheTokensDetails), usage.cachedContentTokenCount);
  return {
    inputText: Math.max(0, prompt.text - cached.text),
    inputAudio: Math.max(0, prompt.audio - cached.audio),
    inputImage: Math.max(0, prompt.image - cached.image),
    cachedText: cached.text,
    cachedAudio: cached.audio,
    cachedImage: cached.image,
  };
}

/**
 * Read Gemini's usage report.
 *
 * @param raw - The `usageMetadata` object of a reply or a live turn.
 * @returns The counts, or the empty count when there is no report.
 */
export function countsFrom(raw: unknown): TokenCounts {
  const parsed = UsageMetadata.safeParse(raw ?? {});
  if (!parsed.success) return NO_TOKENS;
  const usage = parsed.data;
  const output = topUp(
    split([...usage.candidatesTokensDetails, ...usage.responseTokensDetails]),
    usage.candidatesTokenCount + usage.responseTokenCount,
  );
  return {
    ...NO_TOKENS,
    ...inputOf(usage),
    outputText: output.text + output.image,
    outputAudio: output.audio,
    thinking: usage.thoughtsTokenCount,
  };
}
