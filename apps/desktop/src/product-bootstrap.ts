/** Select Mindeck state before any Electron cache, settings, or single-instance ownership is opened. */
import { mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { app } from 'electron'
import { mindeckPresentation, mindeckProduct } from '@deepseek-ai/dsh-mindeck-app'
import { resolveMindeckPaths } from '@deepseek-ai/dsh-mindeck-app/paths'

const development = !app.isPackaged
const paths = resolveMindeckPaths({ home: homedir(), appData: app.getPath('appData'), development, environment: process.env })
mkdirSync(paths.userData, { recursive: true })
app.setName(development ? mindeckProduct.developmentName : mindeckProduct.name)
app.setPath('userData', paths.userData)
app.setPath('sessionData', paths.userData)
app.setAppUserModelId(`${mindeckProduct.appId}${development ? '.dev' : ''}`)
process.env.DSH_HOME = paths.home
process.env.DSH_AGENTS_HOME = paths.agentsHome
process.env.DSH_LOCALE_PARAMETERS = JSON.stringify(mindeckPresentation(development))
