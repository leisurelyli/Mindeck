/** Typed paths to assembled Mindeck applications inside Desktop build outputs. */
import type { DesktopAutoUpdateTarget } from './desktop-auto-update-environment.mjs'

/**
 * Locate the assembled Mindeck application inside one target's build output.
 * @param artifacts - Target artifact directory.
 * @param target - Validated Desktop target.
 * @returns Paths to the application, resources, and executable.
 */
export function desktopApplicationPaths(artifacts: string, target: DesktopAutoUpdateTarget): {
  application: string; resources: string; executable: string
}
