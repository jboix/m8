/**
 * The access key: what the browser and the server say to each other about
 * whether this browser may talk to the character at all.
 *
 * The key is optional. A server with none is open, which is what localhost
 * wants. A server reachable by other people sets one.
 */
import { z } from 'zod';

/** Whether a key is needed, and whether this browser has already given it. */
export const AccessState = z.object({
  /** True when the server was started with a key. */
  required: z.boolean(),
  /** True when nothing stands in this browser's way. */
  granted: z.boolean(),
});

/** Whether a key is needed, and whether this browser has already given it. */
export type AccessState = z.infer<typeof AccessState>;

/** The key, as somebody typed it. */
export const UnlockRequest = z.object({ key: z.string().min(1).max(200) });

/** The key, as somebody typed it. */
export type UnlockRequest = z.infer<typeof UnlockRequest>;
