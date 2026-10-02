/** Tier 1 as a hook: on while wanted, reporting what it is doing. */
import type { KnownFace } from '@m8/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Bus } from '../../bus/bus.ts';
import type { Learnable } from './derive.ts';
import { startVision, type Vision, type VisionState } from './start-vision.ts';

/** What there is to learn while vision is not running. */
const NOBODY: Learnable = { embedding: null, inView: 0 };

/** What the rest of the app sees of vision. */
export interface VisionHandle {
  /** What it is doing. */
  state: VisionState;
  /** The camera, while it is open, for the preview. */
  stream: MediaStream | null;
  /**
   * The face in front of him, ready to be learned.
   * @returns Its embedding, or `null` when there is nobody to learn, and how
   * many faces are in view.
   */
  faceToLearn: () => Learnable;
}

/** What the recogniser is given. */
export interface FaceOptions {
  /** Whether faces are recognised at all. Changing it restarts vision. */
  knowsFaces: boolean;
  /** The faces he knows. Changing it does not restart anything. */
  known: KnownFace[];
}

/**
 * Run tier 1 while it is wanted.
 *
 * @param bus - Where its events go.
 * @param wanted - Whether the camera should be open.
 * @param faces - Whether to recognise faces, and which ones.
 * @returns The state, the camera, and the face to learn.
 */
export function useVision(bus: Bus, wanted: boolean, faces: FaceOptions): VisionHandle {
  const [state, setState] = useState<VisionState>({ status: 'starting' });
  const [stream, setStream] = useState<MediaStream | null>(null);
  const vision = useRef<Vision | null>(null);
  const { knowsFaces, known } = faces;
  // A ref, so a restart gets the current list without the list restarting anything.
  const latestKnown = useRef(known);

  const onState = useCallback((next: VisionState, camera: MediaStream | null) => {
    setState(next);
    setStream(camera);
  }, []);

  useEffect(() => {
    if (!wanted) {
      setStream(null);
      return;
    }
    const started = startVision({ bus, knowsFaces, onState });
    started.setKnownFaces(latestKnown.current);
    vision.current = started;
    return () => {
      started.stop();
      vision.current = null;
      setStream(null);
    };
  }, [bus, wanted, knowsFaces, onState]);

  useEffect(() => {
    latestKnown.current = known;
    vision.current?.setKnownFaces(known);
  }, [known]);

  const faceToLearn = useCallback((): Learnable => vision.current?.faceToLearn() ?? NOBODY, []);

  return { state, stream, faceToLearn };
}
