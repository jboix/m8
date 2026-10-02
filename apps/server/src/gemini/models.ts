/**
 * The models a key can use, sorted into live and text models, newest first.
 * The list comes from Gemini, so no model name is written in the code.
 */
import type { GeminiModel, GeminiModels } from '@m8/shared';
import { z } from 'zod';
import { callGemini, type Fetcher } from './rest.ts';

/** One entry of the models endpoint. Only the fields read here are described. */
const ListedModel = z.object({
  name: z.string(),
  displayName: z.string().optional(),
  supportedGenerationMethods: z.array(z.string()).default([]),
});

/** One entry of the models endpoint. */
type ListedModel = z.infer<typeof ListedModel>;

/** One page of the models endpoint. */
const ModelPage = z.object({
  models: z.array(ListedModel).default([]),
  nextPageToken: z.string().optional(),
});

/** The most pages read, so a listing that never ends cannot hold a request open. */
const MAX_PAGES = 5;

/** Live models that do something other than hold a conversation. */
const NOT_CONVERSATION = /transcribe|translate|robotics/;

/** Text models that answer with something other than text, or do one narrow job. */
const NOT_TEXT = /tts|image|embed|transcribe|robotics|computer-use|live|audio|omni/;

/**
 * Read every page of the models endpoint.
 *
 * @param fetcher - The fetch to use.
 * @param apiKey - The key to list for.
 * @returns Every model the key can see.
 * @throws {GeminiError} When Gemini refuses, which is how a bad key shows.
 */
async function listAll(fetcher: Fetcher, apiKey: string): Promise<ListedModel[]> {
  const models: ListedModel[] = [];
  let pageToken = '';
  for (let page = 0; page < MAX_PAGES; page++) {
    const query = new URLSearchParams({ pageSize: '1000', ...(pageToken ? { pageToken } : {}) });
    const parsed = ModelPage.parse(await callGemini(fetcher, `/models?${query}`, apiKey));
    models.push(...parsed.models);
    if (!parsed.nextPageToken) break;
    pageToken = parsed.nextPageToken;
  }
  return models;
}

/**
 * The generation of a model, from its id.
 *
 * @param id - Such as `gemini-3.8-flash`.
 * @returns The major and minor numbers, or zeros for an id without them,
 * such as `gemini-flash-latest`, which then sorts last.
 */
function generation(id: string): [number, number] {
  const match = /^gemini-(\d+)(?:\.(\d+))?/.exec(id);
  return [Number(match?.[1] ?? 0), Number(match?.[2] ?? 0)];
}

/**
 * Order two models newest first.
 *
 * @param left - One model.
 * @param right - The other.
 * @returns Negative when `left` comes first. A newer generation comes first,
 * then a released model before a preview, then the shorter id, because the
 * plain model comes before its variants.
 */
function newestFirst(left: GeminiModel, right: GeminiModel): number {
  const [leftMajor, leftMinor] = generation(left.id);
  const [rightMajor, rightMinor] = generation(right.id);
  const preview = (id: string) => (/preview|exp/.test(id) ? 1 : 0);
  return (
    rightMajor - leftMajor ||
    rightMinor - leftMinor ||
    preview(left.id) - preview(right.id) ||
    left.id.length - right.id.length ||
    left.id.localeCompare(right.id)
  );
}

/**
 * Sort the listing into what m8 can use.
 *
 * @param listed - What the models endpoint returned.
 * @returns The live and text models, newest first.
 */
export function sortModels(listed: readonly ListedModel[]): GeminiModels {
  const pick = (method: string, excluded: RegExp) =>
    listed
      .filter((model) => model.supportedGenerationMethods.includes(method))
      .map((model) => {
        const id = model.name.replace(/^models\//, '');
        return { id, name: model.displayName ?? id };
      })
      .filter((model) => model.id.startsWith('gemini-') && !excluded.test(model.id))
      .sort(newestFirst);
  return {
    live: pick('bidiGenerateContent', NOT_CONVERSATION),
    text: pick('generateContent', NOT_TEXT),
  };
}

/**
 * List the models a key can use.
 *
 * @param fetcher - The fetch to use.
 * @param apiKey - The key.
 * @returns The live and text models, newest first.
 * @throws {GeminiError} When Gemini refuses the key.
 */
export async function listModels(fetcher: Fetcher, apiKey: string): Promise<GeminiModels> {
  return sortModels(await listAll(fetcher, apiKey));
}
