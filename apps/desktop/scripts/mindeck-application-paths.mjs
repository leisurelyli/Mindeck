/** Locate assembled Mindeck applications using the installation's product identity. */
import { join } from 'node:path'
import product from '@deepseek-ai/dsh-mindeck-app/src/product.json' with { type: 'json' }

/**
 * Locate the assembled Mindeck application for one target without consulting installed applications.
 * @param {string} artifacts - Target artifact output directory.
 * @param {'mac-arm64' | 'mac-x64' | 'win-x64'} target - Validated Desktop target.
 * @returns {{ application: string, resources: string, executable: string }} Paths inside the build output.
 */
export function desktopApplicationPaths(artifacts, target) {
  const windows = target === 'win-x64'
  const application = windows ? join(artifacts, 'win-unpacked')
    : join(artifacts, target === 'mac-arm64' ? 'mac-arm64' : 'mac', `${product.name}.app`)
  return { application,
    resources: windows ? join(application, 'resources') : join(application, 'Contents', 'Resources'),
    executable: windows ? join(application, `${product.name}.exe`) : join(application, 'Contents', 'MacOS', product.name),
  }
}
