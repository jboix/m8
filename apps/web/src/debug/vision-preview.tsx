/**
 * What the camera sees, with what tier 1 made of it drawn on top. The answer to
 * "is it actually looking at me", which the event timeline can only give in
 * numbers.
 *
 * The overlay is drawn from bus events rather than from the worker's raw
 * output, so what you see here is exactly what the character reacted to.
 */
import { useEffect, useRef } from 'react';
import type { Bus } from '../bus/bus.ts';
import { type Sights, useLatestSights } from './use-latest-sights.ts';

/** What the preview shows. */
interface VisionPreviewProps {
  /** The camera, or `null` when it is off. */
  stream: MediaStream | null;
  /** The bus the sightings arrive on. */
  bus: Bus;
}

/** What the overlay draws on one frame. */
interface OverlayProps {
  /** The latest sightings. */
  sights: ReturnType<typeof useLatestSights>;
}

/**
 * The boxes and blobs, in the same 0 to 1 space the events use.
 *
 * @param props - The latest sightings.
 * @returns The overlay.
 */
function Overlay({ sights }: OverlayProps) {
  const { faces, motion } = sights;
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      {motion ? (
        <circle
          className="m8-mark-motion"
          cx={motion.x * 100}
          cy={motion.y * 100}
          r={4 + motion.magnitude * 14}
        />
      ) : null}
      {[...faces.values()].map((face) => (
        <rect
          key={face.id}
          className={face.facing ? 'm8-mark-face m8-facing' : 'm8-mark-face'}
          x={face.x * 100 - (face.size * 100) / 2}
          y={face.y * 100 - (face.size * 100) / 2}
          width={face.size * 100}
          height={face.size * 100}
          rx={2}
        />
      ))}
    </svg>
  );
}

/**
 * The faces in view, and who each one is once judged.
 *
 * @param sights - The faces and the people by id.
 * @returns "no face", or one entry per face: "f1", "f1 Ada 0.61", "f2 ? 0.12".
 */
function describeFaces({ faces, people }: Sights): string {
  if (faces.size === 0) return 'no face';
  return [...faces.keys()]
    .map((id) => {
      const person = people.get(id);
      return person ? `${id} ${person.name ?? '?'} ${person.score.toFixed(2)}` : id;
    })
    .join(' · ');
}

/** One line of what tier 1 currently believes. */
function Readout({ sights }: OverlayProps) {
  return (
    <p className="m8-preview-read">
      <span className={sights.present ? 'm8-kind' : 'm8-detail'}>
        {sights.present ? 'present' : 'nobody'}
      </span>
      <span className="m8-detail">{describeFaces(sights)}</span>
      <span className="m8-detail">{sights.expression?.kind ?? '-'}</span>
      <span className="m8-detail">{sights.gesture?.kind ?? '-'}</span>
      <span className="m8-legend">box face · blob motion</span>
    </p>
  );
}

/**
 * The camera with the overlay over it.
 *
 * @param props - The camera and the bus.
 * @returns The preview, or nothing when the camera is off.
 */
export function VisionPreview({ stream, bus }: VisionPreviewProps) {
  const video = useRef<HTMLVideoElement>(null);
  const sights = useLatestSights(bus);

  useEffect(() => {
    const element = video.current;
    if (!element || !stream) return;
    element.srcObject = stream;
    void element.play().catch(() => {
      // Autoplay refused. The overlay still works, which is the useful half.
    });
  }, [stream]);

  if (!stream) return null;

  return (
    <div className="m8-preview">
      {/* Mirrored, because every coordinate tier 1 reports is mirrored too. */}
      <video ref={video} muted playsInline autoPlay aria-label="What the camera sees">
        <track kind="captions" />
      </video>
      <Overlay sights={sights} />
      <Readout sights={sights} />
    </div>
  );
}
