/** Mindeck installation identity and state directories, resolved before Electron or Host state is opened. */
import { realpathSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import description from './product.json' with { type: 'json' }

/** Stable Mindeck identity shared by the runtime and installer. */
export const mindeckProduct = Object.freeze(description)

/**
 * Resolve public presentation values before the Host or browser starts.
 * @param development - Select the development window title.
 * @returns Non-secret locale defaults derived from the installation descriptor.
 */
export function mindeckPresentation(development: boolean): Readonly<Record<string, string>> {
  return { productName: mindeckProduct.name, productTitle: development
    ? mindeckProduct.developmentName : mindeckProduct.name }
}

/** Inputs for one installation's state selection; generic Harness environment overrides are not consumed. */
export interface MindeckPathRequest {
  readonly home: string
  readonly appData: string
  readonly development: boolean
  readonly environment: NodeJS.ProcessEnv
}

/** Independent state roots passed to Electron and the Harness Host. */
export interface MindeckPaths {
  readonly home: string
  readonly agentsHome: string
  readonly userData: string
}

function canonical(path: string): string {
  try { return realpathSync.native(path) } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    const parent = dirname(path)
    if (parent === path) throw error
    return join(canonical(parent), relative(parent, path))
  }
}

function contains(parent: string, child: string): boolean {
  const suffix = relative(parent, child)
  return suffix === '' || (suffix !== '..' && !suffix.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) && !isAbsolute(suffix))
}

/**
 * Resolve Mindeck paths and reject overlap with existing product roots, including directory aliases.
 * @param request - Host home, Electron appData root, launch mode, and explicit MINDECK overrides.
 * @returns Absolute roots; no directories or caller environment are modified.
 * @throws When an override is empty, relative, or overlaps a reserved state root, or path inspection fails.
 */
export function resolveMindeckPaths(request: MindeckPathRequest): MindeckPaths {
  const reserved = [join(request.home, '.dsh'), join(request.home, '.agents'),
    join(request.appData, 'DeepSeek Harness'), join(request.appData, 'Mindeck'),
    join(request.appData, '@deepseek-ai', 'dsh-desktop'),
    ...(process.platform === 'win32' ? [join(request.home, 'AppData', 'Local', 'Mindeck')] : []),
  ].map(path => canonical(resolve(path)))
  function select(name: string, fallback: string): string {
    const value = request.environment[name] ?? fallback
    if (value.trim() === '' || !isAbsolute(value)) throw new Error(`${name} must name an absolute Mindeck state directory`)
    const selected = canonical(resolve(value))
    if (reserved.some(path => contains(path, selected) || contains(selected, path))) {
      throw new Error(`${name} overlaps another application's state; choose a separate Mindeck directory`)
    }
    return selected
  }
  const home = select('MINDECK_HOME', join(request.home, request.development
    ? mindeckProduct.developmentHomeDirectory : mindeckProduct.homeDirectory))
  return {
    home,
    agentsHome: select('MINDECK_AGENTS_HOME', join(home, 'agents')),
    userData: select('MINDECK_USER_DATA_DIR', join(request.appData, request.development
      ? mindeckProduct.developmentUserDataDirectory : mindeckProduct.userDataDirectory)),
  }
}

/**
 * Resolve isolated development state using the host's home and platform appData directory.
 * @param environment - Environment containing optional platform appData and MINDECK path overrides.
 * @returns Absolute development roots without changing directories or the caller environment.
 * @throws When a path override is invalid, overlaps a reserved root, or path inspection fails.
 */
export function resolveMindeckDevelopmentPaths(environment: NodeJS.ProcessEnv = process.env): MindeckPaths {
  const home = homedir()
  const appData = process.platform === 'win32' ? environment.APPDATA ?? join(home, 'AppData', 'Roaming')
    : process.platform === 'darwin' ? join(home, 'Library', 'Application Support')
      : environment.XDG_CONFIG_HOME ?? join(home, '.config')
  return resolveMindeckPaths({ home, appData, development: true, environment })
}
