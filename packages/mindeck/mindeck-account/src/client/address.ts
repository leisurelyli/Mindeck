/** Cloud address extraction from text a member pastes, such as an activation message or an invitation link. */

/**
 * Find the first web address in pasted text, without its query or fragment. The address ends at white space, quotes,
 * angle brackets, Chinese characters, or full-width punctuation, and trailing punctuation that ends a sentence is
 * not part of it. A page path, such as an invitation link's, stays: the Host resolves it to the Cloud it belongs to.
 * @param text - pasted or typed text.
 * @returns the first `http` or `https` address, or undefined when the text has none.
 */
export function cloudUrlInText(text: string): string | undefined {
  const match = /https?:\/\/[^\s"'<>\p{Script=Han}\u3001-\u303F\uFF00-\uFFEF]+/iu.exec(text)
  if (match === null) return undefined
  return match[0].replace(/[?#].*$/u, '').replace(/[.,;:!?)\]]+$/u, '').replace(/\/+$/u, '')
}
