/** Deployment-owned named values shared by translated copy and pre-plugin presentation. */

/** Initial-document carrier populated by the Host locale plugin. */
export const LOCALE_PARAMETERS_GLOBAL = '__DSH_LOCALE_PARAMETERS__'

/** Resolved presentation values, including application identity. */
export interface LocaleParameters extends Readonly<Record<string, string>> {
  readonly productName: string
  readonly productTitle: string
}

const DEFAULT_PRODUCT_NAME = 'DeepSeek Harness'

/**
 * Detach configured defaults and resolve the application's title.
 * @param input - Deployment values; omission retains the upstream product identity.
 * @returns Immutable interpolation defaults.
 */
export function resolveLocaleParameters(input: Readonly<Record<string, string>> = {}): LocaleParameters {
  const productName = input.productName ?? DEFAULT_PRODUCT_NAME
  const productTitle = input.productTitle ?? productName
  if (productName.trim() === '' || productTitle.trim() === '') {
    throw new TypeError('locale: productName and productTitle must be nonempty text')
  }
  return Object.freeze({ ...input, productName, productTitle })
}

/**
 * Validate deployment parameters supplied by the document or native injection table.
 * @param wire - Untrusted carrier value; an absent carrier selects upstream defaults.
 * @returns Resolved interpolation defaults.
 */
export function parseLocaleParameters(wire: unknown): LocaleParameters {
  if (wire === undefined) return resolveLocaleParameters()
  if (wire === null || typeof wire !== 'object' || Array.isArray(wire)) {
    throw new TypeError('locale: presentation parameters must be a text dictionary')
  }
  const parameters: Record<string, string> = {}
  for (const [name, value] of Object.entries(wire)) {
    if (typeof value !== 'string') throw new TypeError(`locale: parameter ${name} must be text`)
    Object.defineProperty(parameters, name, { value, enumerable: true })
  }
  return resolveLocaleParameters(parameters)
}

/**
 * Read the Host-owned initial presentation carrier.
 * @returns Validated deployment parameters for this document.
 */
export function documentLocaleParameters(): LocaleParameters {
  const carrier = globalThis as { __DSH_LOCALE_PARAMETERS__?: unknown }
  return parseLocaleParameters(carrier.__DSH_LOCALE_PARAMETERS__)
}

/**
 * Interpolate named values while retaining unknown placeholders.
 * @param template - Locale-owned text.
 * @param defaults - Deployment-wide values.
 * @param values - Call-specific values taking precedence over defaults.
 * @returns Rendered text with the existing named-placeholder semantics.
 */
export function formatLocaleTemplate(
  template: string,
  defaults: Readonly<Record<string, string>>,
  values?: Record<string, unknown>,
): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    if (values && name in values) return String(values[name])
    return Object.hasOwn(defaults, name) ? String(defaults[name]) : match
  })
}
