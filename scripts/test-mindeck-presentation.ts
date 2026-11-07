/** Product presentation used by this distribution's component fixtures. */
import product from '../apps/desktop/src/product.json' with { type: 'json' }

Object.defineProperty(globalThis, '__DSH_LOCALE_PARAMETERS__', {
  configurable: true,
  writable: true,
  value: { productName: product.name, productTitle: product.developmentName },
})
