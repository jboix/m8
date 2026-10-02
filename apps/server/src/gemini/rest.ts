/** What every call to the Gemini REST API shares: the address, the fetch, and the errors. */
import { z } from 'zod';

/** Where the REST API lives. */
export const GEMINI_API = 'https://generativelanguage.googleapis.com/v1beta';

/** The fetch the Gemini calls use. Passed in, so a test can answer for Gemini. */
export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

/** How long a REST call may take before it is abandoned. */
const TIMEOUT_MS = 30_000;

/** The error body Gemini answers with. */
const ErrorBody = z.object({ error: z.object({ message: z.string() }) });

/** A call Gemini answered with an error. */
export class GeminiError extends Error {
  /** The HTTP status Gemini answered with. */
  readonly status: number;

  /**
   * Build the error.
   *
   * @param status - The HTTP status.
   * @param message - What Gemini said.
   */
  constructor(status: number, message: string) {
    super(message);
    this.name = 'GeminiError';
    this.status = status;
  }
}

/**
 * Call the REST API with a key.
 *
 * @param fetcher - The fetch to use.
 * @param path - The path after the version, such as `/models`.
 * @param apiKey - The key. It goes in a header, never in the URL.
 * @param body - A JSON body to POST, or undefined for a GET.
 * @returns The parsed JSON reply.
 * @throws {GeminiError} When Gemini answers with an error. The message is
 * Gemini's own first line, because it says what to do: a bad key, a model
 * that is gone, a quota that is spent.
 */
export async function callGemini(
  fetcher: Fetcher,
  path: string,
  apiKey: string,
  body?: unknown,
): Promise<unknown> {
  const response = await fetcher(`${GEMINI_API}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const reply: unknown = await response.json().catch(() => null);
  if (response.ok) return reply;

  const said = ErrorBody.safeParse(reply).data?.error.message;
  const firstLine = said?.split('\n')[0]?.trim();
  throw new GeminiError(response.status, firstLine || `Gemini answered ${response.status}.`);
}
