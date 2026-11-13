/** Cloud address extraction from text a member pastes, such as an account invitation. */

/**
 * Find the first web address in pasted text. Trailing punctuation that ends a sentence is not part of it.
 * @param text - pasted text.
 * @returns the first `http` or `https` address, or undefined when the text has none.
 */
export function cloudUrlInText(text: string): string | undefined {
  const match = /https?:\/\/[^\s"'<>，。；：、！？（）【】「」]+/iu.exec(text)
  return match?.[0].replace(/[.,;:!?)\]]+$/u, '')
}
