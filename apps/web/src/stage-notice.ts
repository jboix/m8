/**
 * The one line under the eyes that says something is wrong. The rig shows
 * every detail, but it is a debugging tool: a person without it still has to
 * know why he has stopped answering.
 */
import type { SessionState } from '@m8/shared';

/** What the line is decided from. */
export interface StageHealth {
  /** What to say while the browser is waiting for a touch before it allows sound, or null. */
  tapToWake: string | null;
  /** Why the camera failed, or null when it did not. */
  cameraFault: string | null;
  /** Where the live session is up to. */
  session: SessionState['state'];
  /** Why the session failed, when it says. */
  sessionDetail: string | undefined;
  /** True while a session is wanted. A session that is meant to be closed is not a fault. */
  sessionWanted: boolean;
}

/**
 * Decide what the line says.
 *
 * @param health - The camera and the session.
 * @returns The line, or null when there is nothing to report. Waiting for a
 * touch comes first, because nothing else can start until it happens. A session that
 * cannot be reached outranks a camera that would not open, because without the
 * session he cannot speak at all.
 */
export function stageNotice(health: StageHealth): string | null {
  if (health.tapToWake) return health.tapToWake;
  if (health.sessionWanted && health.session === 'failed') {
    const why = health.sessionDetail ? `: ${health.sessionDetail}` : '';
    return `He cannot hear or speak right now${why}. Trying again.`;
  }
  if (health.sessionWanted && health.session === 'reconnecting') {
    return 'He lost the connection. Reconnecting.';
  }
  return health.cameraFault;
}
