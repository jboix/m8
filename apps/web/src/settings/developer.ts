/** Whether the developer options are on. */
import type { Settings } from '@m8/shared';

/**
 * Whether the settings offer the rig and the stage shows its button.
 *
 * @param settings - The person's settings, for the developer switch.
 * @param devBuild - True in a development build, which always offers the rig.
 * @returns True when the switch is on or the build is a development build.
 */
export function offersRig(settings: Settings, devBuild: boolean): boolean {
  return devBuild || settings.developer;
}
