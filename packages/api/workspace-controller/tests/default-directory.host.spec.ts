import { describe, expect, it, vi } from 'vitest'
import type { NativeCommandRunner } from '@deepseek-ai/dsh-native-command'
import { defaultWorkspaceDirectory, validateDocumentsDirectory, validateDocumentsFolder } from '../src/default-directory.ts'

describe('system Documents directory', () => {
  it.each([
    ['darwin', '/Users/a/文档/\n', '/Users/a/文档/deepseek-harness/default-workspace', 'osascript'],
    ['win32', 'D:\\Redirected Documents\r\n', 'D:\\Redirected Documents\\deepseek-harness\\default-workspace', 'powershell.exe'],
    ['linux', '/home/a/My Documents\n', '/home/a/My Documents/deepseek-harness/default-workspace', 'xdg-user-dir'],
  ] as const)('uses the %s account directory and preserves spaces and Unicode', async (platform, stdout, path, command) => {
    const run = vi.fn<NativeCommandRunner>(async () => ({ stdout, stderr: '' }))
    const signal = new AbortController().signal
    await expect(defaultWorkspaceDirectory(undefined, 'deepseek-harness', signal, { platform, run })).resolves.toBe(path)
    expect(run).toHaveBeenCalledWith(command, expect.any(Array), signal, 'hidden')
  })

  it('uses the configured directory and product folder without a system lookup', async () => {
    const run = vi.fn<NativeCommandRunner>()
    await expect(defaultWorkspaceDirectory('/documents', 'Mindeck', new AbortController().signal, { platform: 'linux', run }))
      .resolves.toBe('/documents/Mindeck/default-workspace')
    expect(run).not.toHaveBeenCalled()
  })

  it.each(['', '\r\n', '/home/a\n'])('rejects an unavailable XDG directory %j', async (stdout) => {
    const run: NativeCommandRunner = async () => ({ stdout, stderr: '' })
    await expect(defaultWorkspaceDirectory(undefined, 'deepseek-harness', new AbortController().signal, { platform: 'linux', home: '/home/a', run }))
      .rejects.toThrow('unavailable')
  })

  it('propagates lookup failure and cancellation', async () => {
    const run: NativeCommandRunner = async () => { throw new Error('lookup denied') }
    await expect(defaultWorkspaceDirectory(undefined, 'deepseek-harness', new AbortController().signal, { platform: 'darwin', run }))
      .rejects.toThrow('lookup denied')
    await expect(defaultWorkspaceDirectory('/documents', 'deepseek-harness', AbortSignal.abort(), { platform: 'linux' }))
      .rejects.toThrow()
    await expect(defaultWorkspaceDirectory(undefined, 'deepseek-harness', new AbortController().signal, { platform: 'freebsd' }))
      .rejects.toThrow('unavailable')
  })

  it.each(['relative', 'C:relative', '\\rooted'])('rejects a Windows path without a fully qualified root: %s', (path) => {
    expect(() => validateDocumentsDirectory(path, 'win32')).toThrow('fully qualified')
  })

  it('accepts redirected UNC Documents directories', () => {
    expect(validateDocumentsDirectory('\\\\server\\share\\Documents', 'win32')).toBe('\\\\server\\share\\Documents')
    expect(() => validateDocumentsDirectory('relative', 'linux')).toThrow('fully qualified')
  })

  it.each(['', '.', '..', 'a/b', 'a\\b', 'name.', 'name ', 'a:b', 'NUL', 'com1.txt', 'tab\there'])('rejects the Documents folder %j', (folder) => {
    expect(() => validateDocumentsFolder(folder)).toThrow('one file name')
  })

  it('accepts a product folder name with spaces and Unicode', () => {
    expect(validateDocumentsFolder('Mindeck 企业版')).toBe('Mindeck 企业版')
  })
})
