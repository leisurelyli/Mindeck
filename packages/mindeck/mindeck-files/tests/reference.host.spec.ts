/** Library references read unambiguously in message text and resolve back to library paths. */
import { expect, it } from 'vitest'
import { findLibraryReference, libraryPathOf, libraryReference } from '../src/reference.ts'

it('quotes the path, marks folders with a slash, and resolves the reference back to the path', () => {
  expect(libraryReference('/研发部/规范.md', false)).toBe('library:"/研发部/规范.md"')
  expect(libraryReference('/Shared with me/周报', true)).toBe('library:"/Shared with me/周报/"')
  expect(libraryReference('/研发部/周报/', true)).toBe('library:"/研发部/周报/"')
  for (const path of ['/研发部/规范.md', '/Shared with me/周报/', '/a "b".md']) {
    expect(libraryPathOf(libraryReference(path, false))).toBe(path)
  }
  expect(libraryPathOf('library:/Personal/x.md')).toBe('/Personal/x.md')
  expect(libraryPathOf('/Personal/x.md')).toBe('/Personal/x.md')
  expect(libraryPathOf('library:"')).toBe('"')
})

it('finds quoted references, also right next to other text, and ends each at its closing quote', () => {
  const first = 'library:"/a b.md"'
  const second = 'library:"/研发部/周报/"'
  const text = `读${first}，再看 ${second}\nlibrary:/unquoted.md`
  const at = text.indexOf(second)
  expect(findLibraryReference(text, 0)).toEqual({ start: 1, end: 1 + first.length, path: '/a b.md' })
  expect(findLibraryReference(text, 2)).toEqual({ start: at, end: at + second.length, path: '/研发部/周报/' })
  expect(findLibraryReference(text, at + 1)).toBeUndefined()
  expect(findLibraryReference('library:"/a\nb.md"', 0)).toBeUndefined()
})
