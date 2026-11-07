import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it, onTestFinished } from 'vitest'
import product from '../src/product.json' with { type: 'json' }

it.each([undefined, 'Explicit window title'])('publishes source-launch presentation with title %s', (title) => {
  const root = mkdtempSync(join(tmpdir(), 'mindeck-presentation-'))
  onTestFinished(() => { rmSync(root, { recursive: true, force: true }) })
  const output = execFileSync(process.execPath, [
    '--import', new URL('../../../scripts/mindeck-environment.ts', import.meta.url).href,
    '--eval', 'process.stdout.write(process.env.DSH_LOCALE_PARAMETERS)',
  ], {
    cwd: fileURLToPath(new URL('../../../', import.meta.url)),
    encoding: 'utf8',
    env: { ...process.env, DSH_CLIENT_TITLE: title, MINDECK_HOME: join(root, 'home'),
      MINDECK_AGENTS_HOME: join(root, 'agents'), MINDECK_USER_DATA_DIR: join(root, 'user-data') },
  })
  expect(JSON.parse(output)).toEqual({ productName: product.name, productTitle: title ?? product.developmentName })
})
