/** The usage route, from the browser: what the calls to Gemini have used and cost. */
import { GeminiFailure, UsageReport } from '@m8/shared';

/**
 * Read everything spent since a moment.
 *
 * @param from - The start of the report, in ms since the epoch.
 * @returns The report, one bucket per hour, purpose and model.
 * @throws {Error} With the server's own message when it answers with an error.
 */
export async function readUsage(from: number): Promise<UsageReport> {
  const response = await fetch(`/api/usage?from=${Math.floor(from)}`);
  const body: unknown = await response.json().catch(() => null);
  if (response.ok) return UsageReport.parse(body);
  throw new Error(
    GeminiFailure.safeParse(body).data?.error ?? `The server answered ${response.status}.`,
  );
}
