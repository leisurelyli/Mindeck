/** Set the Mindeck source-launch environment and Web profile layers before the supported Web profile starts. */
import { join } from 'node:path'
import { prepareMindeckProfile } from '../apps/desktop/src/mindeck-profile.ts'
import { mindeckPresentation, mindeckProduct } from '../packages/bundle/mindeck-app/src/product.ts'
import { resolveMindeckDevelopmentPaths } from '../packages/bundle/mindeck-app/src/paths.ts'

const paths = resolveMindeckDevelopmentPaths()
process.env.DSH_HOME = paths.home
process.env.DSH_AGENTS_HOME = paths.agentsHome
process.env.DSH_CLIENT_TITLE ??= mindeckProduct.developmentName
process.env.DSH_LOCALE_PARAMETERS = JSON.stringify({
  ...mindeckPresentation(true), productTitle: process.env.DSH_CLIENT_TITLE,
})
// Settings can edit only profile and bundle rows, so the Mindeck bundle joins the Web profile as on Desktop.
prepareMindeckProfile(join(paths.home, 'profiles', 'web'))
