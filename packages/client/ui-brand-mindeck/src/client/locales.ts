/** Typed product text for Mindeck brand presentation. */

/** Chinese dictionary defining the brand key set. */
export const zh = {
  'brand.name': '{productName}',
} satisfies Record<string, string>

/** Product text keys accepted by the Mindeck namespace. */
export type MindeckKey = keyof typeof zh

/** English dictionary with the same product name. */
export const en = {
  'brand.name': '{productName}',
} satisfies Record<MindeckKey, string>

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Mindeck brand text and accessible image names. */
    mindeck: MindeckKey
  }
}
