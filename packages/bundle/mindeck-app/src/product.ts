/** Mindeck product descriptor shared by its launchers and builds. */
import description from './product.json' with { type: 'json' }

/** Stable Mindeck identity shared by the runtime and installer. */
export const mindeckProduct = Object.freeze(description)

/**
 * Resolve public presentation values before the Host or browser starts.
 * @param development - Select the development window title.
 * @returns Non-secret locale defaults derived from the installation descriptor.
 */
export function mindeckPresentation(development: boolean): Readonly<Record<string, string>> {
  return { productName: mindeckProduct.name, productTitle: development
    ? mindeckProduct.developmentName : mindeckProduct.name }
}
