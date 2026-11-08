/** Set the Mindeck source-launch environment before the supported Web profile starts. */
import { mindeckPresentation, mindeckProduct } from '../packages/bundle/mindeck-app/src/product.ts'
import { resolveMindeckDevelopmentPaths } from '../packages/bundle/mindeck-app/src/paths.ts'

const paths = resolveMindeckDevelopmentPaths()
process.env.DSH_HOME = paths.home
process.env.DSH_AGENTS_HOME = paths.agentsHome
process.env.DSH_CLIENT_TITLE ??= mindeckProduct.developmentName
process.env.DSH_LOCALE_PARAMETERS = JSON.stringify({
  ...mindeckPresentation(true), productTitle: process.env.DSH_CLIENT_TITLE,
})
