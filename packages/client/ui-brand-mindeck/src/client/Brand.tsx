/** Static Mindeck artwork and localized product name. */
import type { HeroBrandMarkOwnerProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import mindeckMark from './assets/mindeck.svg'
import css from './Brand.module.css'

/**
 * Render the supplied artwork at the host's requested square size.
 * @param props - Host geometry and the bound Mindeck translator.
 * @returns The original blue and cyan Mindeck mark.
 */
export function MindeckBrandMark({ size, className, t }: HeroBrandMarkOwnerProps & PropsLocale<'mindeck'>) {
  return <img src={mindeckMark} alt={t('brand.name')} width={size} height={size} className={className} />
}

/**
 * Render the localized name independently of its mark.
 * @param props - Bound Mindeck translator.
 * @returns The Mindeck product name.
 */
export function MindeckBrandName({ t }: PropsLocale<'mindeck'>) {
  return <span className={css.name}>{t('brand.name')}</span>
}
