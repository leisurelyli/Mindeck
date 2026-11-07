/** Host registration for the browser locale preference. */
import type {} from '@deepseek-ai/dsh-settings'
import type {} from '@deepseek-ai/dsh-host-webserver'

import type { Volatile, Context } from '@deepseek-ai/cordis'

import z from '@deepseek-ai/schemastery'
import { LOCALE_PREFERENCE_FIELD } from './locale-settings.ts'

import { LocaleSettingsFields } from './locale-settings.ts'
import { LOCALE_PARAMETERS_GLOBAL, parseLocaleParameters, resolveLocaleParameters } from './parameters.ts'

export {
  LOCALE_IDS, LOCALE_PREFERENCE_FIELD, LOCALE_SETTINGS_NAMESPACE,
  type BuiltInLocaleId, type LocaleId, type LocaleSettings,
} from './locale-settings.ts'

/** Runtime preferences projected to the browser. */
export interface Config {
  /** Explicit locale; omission follows the browser. */
  [LOCALE_PREFERENCE_FIELD]: Volatile<string | undefined>
  /** Deployment-wide defaults; an empty map inherits the public launch parameters. */
  parameters?: Readonly<Record<string, string>>
}

/** Live preferences projected to the browser. */
export const Config = z.object({
  [LOCALE_PREFERENCE_FIELD]: LocaleSettingsFields[LOCALE_PREFERENCE_FIELD].volatile(),
  parameters: z.dict(z.string()).required(false),
})

/** Host preferences are consumed through the configuration form projection.
 * @param ctx Plugin context used for initial document data and optional settings presentation.
 * @param config Deployment-wide interpolation parameters.
 */
export function apply(ctx: Context, config: Config = Config()): void {
  const serialized = process.env.DSH_LOCALE_PARAMETERS
  const configured = config.parameters && Object.keys(config.parameters).length > 0 ? config.parameters : undefined
  const parameters = configured !== undefined || serialized === undefined
    ? resolveLocaleParameters(configured)
    : parseLocaleParameters(JSON.parse(serialized))
  ctx.on('webserver/index-inject', (table) => {
    table.push({ kind: 'global', name: LOCALE_PARAMETERS_GLOBAL, value: parameters })
  })
  ctx.inject(['settings'], (child) => { child.effect(() => child.settings.configure({ auto: false }, ctx.fiber)) })
}
