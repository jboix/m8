/**
 * What tier 1 is doing, and the switch that turns it off. The switch is not a
 * convenience: measuring the renderer with the camera off and on shows
 * whether vision and the eyes contend for the GPU.
 */
import type { VisionState } from '../senses/vision/start-vision.ts';

/** What the row shows and drives. */
interface VisionStatusProps {
  /** What tier 1 is doing. */
  vision: VisionState;
  /** Whether the camera is wanted. */
  camera: boolean;
  /** Turns it on and off. */
  onCamera: (wanted: boolean) => void;
  /** Whether the mouse may stand in for a face. */
  mouse: boolean;
  /** Turns that on and off. */
  onMouse: (wanted: boolean) => void;
  /** Whether it is actually publishing, which the camera suppresses. */
  mouseActive: boolean;
}

/**
 * Describe the state in a few words.
 *
 * @param vision - What tier 1 is doing.
 * @param camera - Whether it was asked for at all.
 * @returns The line to show.
 */
function describe(vision: VisionState, camera: boolean): string {
  if (!camera) return 'camera off';
  if (vision.status === 'running') return `${vision.fps} fps`;
  if (vision.status === 'starting') return 'opening the camera';
  if (vision.status === 'loading') return 'loading models';
  return vision.message;
}

/**
 * What the mouse button says.
 *
 * @param mouse - Whether it is allowed to stand in for a face.
 * @param active - Whether it is actually publishing.
 * @returns The label, which says when the camera has taken over.
 */
function mouseLabel(mouse: boolean, active: boolean): string {
  if (!mouse) return 'mouse off';
  return active ? 'mouse on' : 'mouse: camera has it';
}

/**
 * The vision row.
 *
 * @param props - The state and the switch.
 * @returns The row.
 */
export function VisionStatus({
  vision,
  camera,
  onCamera,
  mouse,
  onMouse,
  mouseActive,
}: VisionStatusProps) {
  const failed = camera && vision.status === 'failed';
  return (
    <div className="m8-chips">
      <button
        type="button"
        className={camera ? 'm8-pin-on' : ''}
        onClick={() => {
          onCamera(!camera);
        }}
      >
        camera {camera ? 'on' : 'off'}
      </button>
      <button
        type="button"
        className={mouseActive ? 'm8-pin-on' : 'm8-chip-off'}
        onClick={() => {
          onMouse(!mouse);
        }}
      >
        {mouseLabel(mouse, mouseActive)}
      </button>
      <span className={failed ? 'm8-fault' : 'm8-detail'}>{describe(vision, camera)}</span>
    </div>
  );
}
