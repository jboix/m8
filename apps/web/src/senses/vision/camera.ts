/**
 * Opening the camera, and saying something useful when it will not open.
 *
 * Tier 1 vision never leaves the browser, so this stream is only ever read by
 * the worker next door.
 */

/** Why the camera is not running. Each one has a different thing to tell a person. */
export type CameraFault = 'insecure' | 'unsupported' | 'denied' | 'missing' | 'in-use' | 'unknown';

/** A camera that failed to open, with something a person can act on. */
export class CameraError extends Error {
  /** Which kind of failure this is. */
  readonly fault: CameraFault;

  /**
   * @param fault - Which kind of failure.
   * @param message - What to show. Written for a person, not a log.
   */
  constructor(fault: CameraFault, message: string) {
    super(message);
    this.name = 'CameraError';
    this.fault = fault;
  }
}

/** What to say for each thing that can go wrong. */
const EXPLANATION: Record<CameraFault, string> = {
  insecure:
    'The camera needs https, or localhost. This page is on plain http, so the browser hides it entirely.',
  unsupported: 'This browser has no camera API.',
  denied: 'The camera was blocked. Allow it in the address bar and try again.',
  missing: 'No camera is connected.',
  'in-use': 'The camera is already in use by another application.',
  unknown: 'The camera could not be opened.',
};

/** What the camera is asked for. Low and slow: tier 1 reads shapes, not detail. */
const WANTED: MediaStreamConstraints = {
  video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 15 } },
  audio: false,
};

/**
 * Work out which fault a `getUserMedia` rejection was.
 *
 * @param error - Whatever it threw.
 * @returns The fault it maps to.
 */
function faultOf(error: unknown): CameraFault {
  const name = error instanceof DOMException ? error.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'denied';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'missing';
  if (name === 'NotReadableError' || name === 'AbortError') return 'in-use';
  return 'unknown';
}

/**
 * Open the camera.
 *
 * @remarks
 * `navigator.mediaDevices` is `undefined` outside a secure context rather than
 * throwing, so a page served over plain http on a LAN address fails here with a
 * `TypeError` about a missing property. That is a confusing way to find out, so
 * it is checked first and reported as what it is.
 *
 * @returns The stream.
 * @throws {CameraError} With a `fault` saying which of the six things went
 * wrong, and a message written for a person.
 */
export async function openCamera(): Promise<MediaStream> {
  if (typeof navigator === 'undefined') {
    throw new CameraError('unsupported', EXPLANATION.unsupported);
  }
  if (!globalThis.isSecureContext) {
    throw new CameraError('insecure', EXPLANATION.insecure);
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new CameraError('unsupported', EXPLANATION.unsupported);
  }

  try {
    return await navigator.mediaDevices.getUserMedia(WANTED);
  } catch (error) {
    const fault = faultOf(error);
    throw new CameraError(fault, EXPLANATION[fault]);
  }
}

/**
 * Stop every track on a stream. Safe to call on one already stopped.
 *
 * @param stream - The stream to release, which turns the camera light off.
 */
export function closeCamera(stream: MediaStream): void {
  for (const track of stream.getTracks()) track.stop();
}
