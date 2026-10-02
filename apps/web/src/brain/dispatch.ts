/**
 * Carries out the tools the model calls. Section 7.3's client executors.
 *
 * Every one of them is a call into the three functions `web/eyes` exposes,
 * which is why this file is short: the interface was built for it.
 * Gaze targets stay semantic the whole way through, because the arbiter is the
 * only thing that knows where anything actually is.
 */
import type { ToolInput } from '@m8/shared';
import type { EyesControls } from '../eyes/index.ts';

/** The tools that answer with words, from what the browser knows. */
export interface LocalTools {
  /**
   * Who is in front of him.
   * @returns A sentence for the model.
   */
  whoIsHere(): string;
  /**
   * Learn the face in front of him under a name.
   * @param name - The name.
   * @returns A sentence for the model: learned, nobody there, or switched off.
   */
  nameFace(name: string): string;
}

/**
 * Do what the model asked.
 *
 * @param controls - The three functions the eyes expose.
 * @param local - The tools that answer from what the browser knows.
 * @param input - The parsed tool call.
 * @returns What to tell the model, for a tool that answers with words.
 */
export function dispatchTool(
  controls: EyesControls,
  local: LocalTools,
  input: ToolInput,
): string | undefined {
  switch (input.name) {
    case 'look_at':
      controls.lookAt(input.target, input.hold_ms);
      return;
    case 'set_emotion':
      // At full strength, the same face the rig's buttons show. A weaker one
      // is half the shape, with a half-faded highlight under a half-drawn star.
      controls.setEmotion(input.emotion, 1);
      return;
    case 'gesture':
      controls.gesture(input.kind);
      return;
    case 'who_is_here':
      return local.whoIsHere();
    case 'name_face':
      return local.nameFace(input.name_of_person);
  }
}
