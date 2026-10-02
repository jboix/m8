/**
 * Shows the model what the camera sees. The model perceives for
 * itself, so frames go up the live session in place of sentences about them.
 *
 * Small, heavily compressed and slow on purpose. One frame a second is the most
 * the session accepts, and every frame is paid for.
 */
import { MAX_FRAME_CHARS } from '@m8/shared';

/** How often a frame is sent. One a second is the session's own ceiling. */
const FRAME_MS = 1000;

/** The longer side of a frame, in pixels. Enough to name what is in a hand. */
const LONG_SIDE = 320;

/** JPEG quality, 0 to 1. Half is about 10 kB a frame at this size. */
const QUALITY = 0.5;

/** What marks the start of the base64 in a data URL. */
const BASE64_MARK = 'base64,';

/** A running frame feed. */
export interface Frames {
  /** Stop sending and release the elements. */
  stop(): void;
}

/**
 * Work out the size a frame is drawn at.
 *
 * @param width - The camera's width.
 * @param height - The camera's height.
 * @returns The size with the longer side at {@link LONG_SIDE}, never enlarged.
 */
export function frameSize(width: number, height: number): { width: number; height: number } {
  const scale = Math.min(1, LONG_SIDE / Math.max(width, height, 1));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/**
 * Draw the camera's current picture and encode it.
 *
 * @param video - The element playing the camera.
 * @param canvas - Where it is drawn.
 * @returns The JPEG as base64, or null when the camera has no picture yet.
 */
function capture(video: HTMLVideoElement, canvas: HTMLCanvasElement): string | null {
  if (video.videoWidth === 0) return null;
  const size = frameSize(video.videoWidth, video.videoHeight);
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext('2d');
  if (!context) return null;
  context.drawImage(video, 0, 0, size.width, size.height);
  const url = canvas.toDataURL('image/jpeg', QUALITY);
  const jpeg = url.slice(url.indexOf(BASE64_MARK) + BASE64_MARK.length);
  return jpeg.length > 0 && jpeg.length <= MAX_FRAME_CHARS ? jpeg : null;
}

/**
 * Start sending frames.
 *
 * @param stream - The camera, which the vision sense already has open. This
 * does not open a second one.
 * @param send - Where a frame goes.
 * @returns The running feed.
 */
export function startFrames(stream: MediaStream, send: (jpeg: string) => void): Frames {
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.srcObject = stream;
  void video.play().catch(() => {
    // No picture means no frames. He still hears, and the eyes still track.
  });
  const canvas = document.createElement('canvas');

  const timer = setInterval(() => {
    const jpeg = capture(video, canvas);
    if (jpeg) send(jpeg);
  }, FRAME_MS);

  return {
    stop() {
      clearInterval(timer);
      video.srcObject = null;
    },
  };
}
