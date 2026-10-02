/** Puts Safari's audio session in call mode while the microphone is open. */

/** The session types the Audio Session API allows. */
type AudioSessionType =
  | 'auto'
  | 'playback'
  | 'transient'
  | 'transient-solo'
  | 'ambient'
  | 'play-and-record';

/** The part of `navigator.audioSession` this module uses. */
interface AudioSession {
  /** How the platform should treat this page's audio. */
  type: AudioSessionType;
}

/**
 * Read the audio session, which only Safari provides.
 *
 * @returns The session, or `undefined` when the browser has none.
 */
function audioSession(): AudioSession | undefined {
  return (navigator as Navigator & { audioSession?: AudioSession }).audioSession;
}

/**
 * Declare a two-way call, so iOS sets up the call route when the microphone is
 * granted instead of switching routes during the conversation.
 *
 * @returns The session type before the change, or `undefined` when the browser
 * has no audio session or the change failed.
 */
export function beginCallAudioSession(): AudioSessionType | undefined {
  try {
    const session = audioSession();
    if (!session) return undefined;
    const previous = session.type;
    session.type = 'play-and-record';
    return previous;
  } catch {
    return undefined;
  }
}

/**
 * Put the session type back to what it was before the call.
 *
 * @param previous - The value `beginCallAudioSession` returned. Nothing
 * happens when it is `undefined`.
 */
export function restoreAudioSession(previous: AudioSessionType | undefined): void {
  if (previous === undefined) return;
  try {
    const session = audioSession();
    if (session) session.type = previous;
  } catch {
    // The session stays as it is. Restoring it is not worth failing over.
  }
}
