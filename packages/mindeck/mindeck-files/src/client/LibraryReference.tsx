/** Library references in sent messages, shown as file and folder labels. */
import type { UserTextNodeProps, UserTextRule } from '@deepseek-ai/dsh-client-ui-conversation/client'
import { ReferenceChip } from '@deepseek-ai/dsh-client-ui-primitives'
import { findLibraryReference } from '../reference.ts'

/** User-text node and Slot key of a library reference. */
export const LIBRARY_TEXT_NODE = 'mindeck-library'

declare module '@deepseek-ai/dsh-client-ui-conversation/client' {
  interface UserTextDataMap {
    /** A library reference; a folder path ends with `/`. */
    'mindeck-library': { readonly path: string }
  }
}

/** Matches the references that the panel inserts. */
export const libraryReferenceRule: UserTextRule<typeof LIBRARY_TEXT_NODE> = {
  id: LIBRARY_TEXT_NODE,
  order: 30,
  match(text, from) {
    const found = findLibraryReference(text, from)
    return found === undefined ? undefined : { id: LIBRARY_TEXT_NODE, start: found.start, end: found.end, data: { path: found.path } }
  },
}

/**
 * @param props - matched reference and its original text.
 * @returns a display-only label with the entry name; the original text is its tooltip.
 */
export function LibraryReference({ node, raw }: UserTextNodeProps<typeof LIBRARY_TEXT_NODE>) {
  const name = node.data.path.split('/').filter(part => part.length > 0).at(-1) ?? node.data.path
  return <ReferenceChip appearance={node.data.path.endsWith('/') ? 'folder' : 'file'} label={name} title={raw} />
}
