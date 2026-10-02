/**
 * The character's face. The app mounts one component and holds one handle; the
 * rig, the springs, the brainstem, the gestures and the gaze arbiter stay in
 * here.
 *
 * `EyesControls` is the whole surface the model reaches: the three functions
 * behind the client-executed tools in section 7.3, and the reason the brain's
 * dispatcher is a dozen lines.
 */
export type { EyesController, EyesControls, EyesInspector } from './controller.ts';
export { Eyes } from './eyes.tsx';
export { createSeededRandom } from './random.ts';
export type { RigParams } from './rig.ts';
