/**
 * Glyphs the shared icon set lacks: a bell for company messages and a megaphone for announcements. Both are 16px
 * outline drawings in the current text color, with the shared set's regular one-pixel stroke.
 */

/**
 * @param props.size - rendered edge in pixels.
 * @returns the bell glyph.
 */
export function BellIcon({ size }: { size: number }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M8 1.75V2.9" />
    <path d="M4.25 6.75a3.75 3.75 0 0 1 7.5 0v2.4c0 .5.17.98.48 1.37l.7.88c.33.41.04 1.02-.49 1.02H3.56c-.53 0-.82-.61-.49-1.02l.7-.88c.31-.39.48-.87.48-1.37v-2.4Z" />
    <path d="M6.5 13.75c.3.45.85.75 1.5.75s1.2-.3 1.5-.75" />
  </svg>
}

/**
 * @param props.size - rendered edge in pixels.
 * @returns the megaphone glyph.
 */
export function MegaphoneIcon({ size }: { size: number }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M10.75 3.25 5.5 5.75H3.25a1 1 0 0 0-1 1v2.5a1 1 0 0 0 1 1H5.5l5.25 2.5V3.25Z" />
    <path d="m5.5 10.25.85 3.1a.75.75 0 0 0 .72.55h.36a.6.6 0 0 0 .58-.76l-.76-2.89" />
    <path d="M12.75 6.25c.6.45 1 1.1 1 1.75s-.4 1.3-1 1.75" />
  </svg>
}
