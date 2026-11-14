/** A search passage with the text that matched marked. */
import { Fragment } from 'react'
import type { LibraryPassagePart } from '../types.ts'

/**
 * @param props.parts - the passage; its parts are fixed for one result and may repeat their text, so they are keyed by position.
 * @param props.className - the passage element's class; its `mark` elements take the match treatment.
 * @returns the passage as one text element.
 */
export function Passage({ parts, className }: { parts: readonly LibraryPassagePart[]; className: string }) {
  return (
    <span className={className}>
      {parts.map((part, index) => part.match ? <mark key={index}>{part.text}</mark> : <Fragment key={index}>{part.text}</Fragment>)}
    </span>
  )
}
