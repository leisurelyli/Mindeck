/** The digital-employee page in the main column: a card per employee that starts a conversation with it. */
import { useId, useState } from 'react'
import { IconChevronRightOutlineRegular, IconNewChatOutlineRegular, Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type { MindeckEmployeeCard, MindeckEmployeeFolderView } from '../types.ts'
import { portrait } from './avatars.ts'
import { avatarInitial, avatarTint } from './cards.ts'
import type { MindeckEmployeesKey } from './locales.ts'
import type { MindeckEmployeesPageInjected } from './operations.ts'
import css from './EmployeesPage.module.css'

/** Composed page props. */
export type EmployeesPageProps = PropsRuntime<'main'> & PropsLocale<'mindeckEmployees'> & InjectFace<MindeckEmployeesPageInjected>

/** Starter requests of the general assistant, which Mindeck Cloud does not configure. */
const GENERAL_STARTERS: readonly MindeckEmployeesKey[] = ['generalStarter1', 'generalStarter2', 'generalStarter3']

/** One card as the page shows it. */
interface CardView {
  readonly presetId: string
  readonly avatar: string
  readonly name: string
  readonly tagline: string
  readonly starters: readonly string[]
  readonly draft: boolean
  readonly folders: readonly MindeckEmployeeFolderView[]
  readonly model: string | null
}

/**
 * @param props.card - the card.
 * @param props.id - id the card's start button names as part of its description.
 * @param props.t - page copy.
 * @returns the folders the employee consults and its default model, or nothing when it has neither.
 */
function Details({ card, id, t }: { card: CardView; id: string; t: EmployeesPageProps['t'] }) {
  if (card.folders.length === 0 && card.model === null) return null
  const folders = card.folders.map(folder => folder.accessible ? folder.label : t('folderNoAccess', { label: folder.label }))
  return (
    <section id={id} className={css.details} aria-label={t('details', { name: card.name })}>
      {card.folders.length > 0 && (
        <p className={css.detail} title={card.folders.map(folder => t('folderTitle', { label: folder.label, path: folder.path })).join('\n')}>
          <span className={css.detailLabel}>{t('folders')}</span>
          <span className={css.detailValue}>{folders.join(t('folderSeparator'))}</span>
        </p>
      )}
      {card.model !== null && (
        <p className={css.detail}>
          <span className={css.detailLabel}>{t('model')}</span>
          <span className={css.detailValue}>{card.model}</span>
        </p>
      )}
    </section>
  )
}

/**
 * @param props.avatar - the avatar key.
 * @param props.name - the card's name, whose first character replaces a missing or broken image.
 * @returns the transparent banner on its backdrop, or the tinted initial.
 */
function Portrait({ avatar, name }: { avatar: string; name: string }) {
  const [failed, setFailed] = useState(false)
  const banner = portrait(avatar)
  if (banner === undefined || failed) {
    return <span className={css.initial} data-tint={avatarTint(avatar)} aria-hidden="true">{avatarInitial(name)}</span>
  }
  return (
    <img className={css.image} src={banner.image} data-backdrop={banner.backdrop} alt="" draggable={false}
      onError={() => { setFailed(true) }} />
  )
}

/**
 * @param props.card - the card.
 * @param props.busy - whether a conversation is opening, which disables every action.
 * @param props.onStart - opens a conversation with the card's preset and an optional starter request.
 * @param props.t - page copy.
 * @returns one card.
 */
function EmployeeCard({ card, busy, onStart, t }: {
  card: CardView
  busy: boolean
  onStart: (starter?: string) => void
  t: EmployeesPageProps['t']
}) {
  const nameId = useId()
  const draftId = useId()
  const detailId = useId()
  const startersId = useId()
  const detailsId = useId()
  const described = [...card.draft ? [draftId] : [], detailId, ...card.folders.length > 0 || card.model !== null ? [detailsId] : []]
  return (
    <article className={css.card} aria-labelledby={nameId}>
      <button type="button" className={css.main} aria-label={t('startWith', { name: card.name })}
        aria-describedby={described.join(' ')}
        disabled={busy} onClick={() => { onStart() }}>
        <span className={css.portrait}>
          <Portrait key={card.avatar} avatar={card.avatar} name={card.name} />
          <span className={css.cta} aria-hidden="true">{t('start')}<IconChevronRightOutlineRegular size={14} /></span>
        </span>
        <span className={css.identity}>
          <span className={css.nameLine}>
            <span id={nameId} className={css.name}>{card.name}</span>
            {card.draft && <span id={draftId} className={css.draft}><Tag tone="neutral">{t('draft')}</Tag></span>}
          </span>
          <span id={detailId} className={css.tagline}>{card.tagline}</span>
        </span>
      </button>
      {card.starters.length > 0 && (
        <div className={css.starters}>
          <p id={startersId} className={css.startersTitle}>{t('starters')}</p>
          <ul className={css.starterList} aria-labelledby={startersId}>
            {card.starters.map(text => (
              <li key={text} className={css.starterItem}>
                <button type="button" className={css.starter} title={text} disabled={busy} onClick={() => { onStart(text) }}>
                  <IconNewChatOutlineRegular size={14} className={css.starterIcon} />
                  <span className={css.starterText}>{text}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <Details card={card} id={detailsId} t={t} />
    </article>
  )
}

/**
 * Registered while the company offers at least one digital employee: the general assistant first, then the
 * company's employees in Mindeck Cloud order, each with its portrait, tagline, and starter requests. Choosing a
 * card opens a blank conversation with that employee; choosing a starter request also puts it in the message box,
 * unsent.
 * @param props - the cards, the start operation, and localized copy.
 * @returns the page.
 */
export function EmployeesPage({ useCatalog, start, t }: EmployeesPageProps) {
  const catalog = useCatalog(snapshot => snapshot.catalog)
  const [busy, setBusy] = useState(false)
  const titleId = useId()
  const view = (card: MindeckEmployeeCard): CardView => card.kind === 'general'
    ? {
      presetId: card.presetId, avatar: 'general', name: t('generalName'), tagline: t('generalTagline'),
      starters: GENERAL_STARTERS.map(key => t(key)), draft: false, folders: [], model: null,
    }
    : {
      presetId: card.presetId, avatar: card.avatar, name: card.name, tagline: card.tagline, starters: card.starters,
      draft: card.draft, folders: card.folders, model: card.model,
    }
  const run = (presetId: string, starter?: string): void => {
    if (busy) return
    setBusy(true)
    void start(presetId, starter).finally(() => { setBusy(false) })
  }

  return (
    <section className={css.page} aria-labelledby={titleId}>
      <div className={css.scroll}>
        <div className={css.content}>
          <header className={css.head}>
            <h1 id={titleId} className={css.title}>{t('panel')}</h1>
            <p className={css.intro}>{t('pageIntro')}</p>
          </header>
          <ul className={css.grid} aria-busy={busy}>
            {(catalog?.cards ?? []).map(view).map(card => (
              <li key={card.presetId} className={css.item}>
                <EmployeeCard card={card} busy={busy} onStart={(starter) => { run(card.presetId, starter) }} t={t} />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}
