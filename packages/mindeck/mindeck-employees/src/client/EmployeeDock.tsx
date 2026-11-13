/** "Who can help?" cards above the composer of a blank conversation, with the chosen employee's starter requests. */
import { useId, useRef, useState } from 'react'
import { IconChevronDownOutlineRegular, IconWarningOutlineRegular, Tag, Toast } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-agent-preset-registry/types'
import type { MindeckEmployeeCard } from '../types.ts'
import { avatarImage } from './avatars.ts'
import { avatarInitial, avatarTint, COLLAPSED_CARDS, visibleCards } from './cards.ts'
import type { MindeckEmployeesInjected } from './operations.ts'
import css from './Employees.module.css'

/** Composed dock props. */
export type EmployeeDockProps = PropsRuntime<'conversation.input.dock'> & PropsLocale<'mindeckEmployees'>
  & InjectFace<MindeckEmployeesInjected>

/** Hold of a refused switch, long enough to read the reason. */
const REFUSAL_HOLD_MS = 8000

/** A switch the Host accepted, shown until the Session's preset moves away from where it was. */
interface Chosen {
  readonly presetId: string
  readonly from: string | null | undefined
}

/**
 * @param props.avatar - the avatar key.
 * @param props.name - the card's name, whose first character replaces a missing or broken image.
 * @returns the avatar image, or its tinted fallback.
 */
function Avatar({ avatar, name }: { avatar: string; name: string }) {
  const [failed, setFailed] = useState(false)
  const src = avatarImage(avatar)
  if (src === undefined || failed) {
    return <span className={css.avatar} data-fallback="" data-tint={avatarTint(avatar)} aria-hidden="true">{avatarInitial(name)}</span>
  }
  return <img className={css.avatar} src={src} alt="" draggable={false} onError={() => { setFailed(true) }} />
}

/**
 * Offered while the conversation has no turn and the company has at least one digital employee; the general
 * assistant comes first. Choosing a card switches the conversation's agent preset; a starter request goes into
 * the message box and is never sent.
 * @param props - the Session, its preset, the cards, the card operations, and localized copy.
 * @returns the cards, a refusal notice, or nothing.
 */
export function EmployeeDock({ session, useProjection, useCatalog, select, insertStarter, t }: EmployeeDockProps) {
  const catalog = useCatalog(snapshot => snapshot.catalog)
  const preset = useProjection('agentPreset')
  const headingId = useId()
  const [expanded, setExpanded] = useState(false)
  const [pending, setPending] = useState<string | undefined>(undefined)
  const [chosen, setChosen] = useState<Chosen | undefined>(undefined)
  const refusalSeq = useRef(0)
  const [refusal, setRefusal] = useState<{ seq: number; text: string } | null>(null)

  const nameOf = (card: MindeckEmployeeCard): string => card.kind === 'general' ? t('generalName') : card.name
  const toast = refusal === null ? null : (
    <Toast key={refusal.seq} text={refusal.text} icon={<IconWarningOutlineRegular />} holdMs={REFUSAL_HOLD_MS}
      anchor={document.querySelector<HTMLElement>('[data-composer-card]')} onDone={() => { setRefusal(null) }} />
  )
  const cards = catalog?.cards ?? []
  if (!session.blank || session.promptAttempted || !cards.some(card => card.kind === 'employee')) return toast

  // The Session's preset arrives with its next projection frame; until then the accepted choice stays selected.
  const selected = pending ?? (chosen !== undefined && chosen.from === preset ? chosen.presetId : preset ?? undefined)
  const current = cards.find(card => card.presetId === selected)
  const starters = current?.kind === 'employee' ? current.starters : []
  const choose = async (card: MindeckEmployeeCard): Promise<void> => {
    if (pending !== undefined || card.presetId === selected) return
    setPending(card.presetId)
    const reason = await select(card.presetId).finally(() => { setPending(undefined) })
    if (reason === undefined) { setChosen({ presetId: card.presetId, from: preset }); return }
    setChosen(undefined)
    refusalSeq.current += 1
    setRefusal({ seq: refusalSeq.current, text: t('selectRefused', { name: nameOf(card), reason }) })
  }

  return (
    <section className={css.dock} aria-labelledby={headingId} aria-busy={pending !== undefined}>
      <div className={css.header}>
        <h2 id={headingId} className={css.title}>{t('title')}</h2>
        {cards.length > COLLAPSED_CARDS && (
          <button type="button" className={css.toggle} aria-expanded={expanded} onClick={() => { setExpanded(value => !value) }}>
            {expanded ? t('showFewer') : t('showAll')}
            <IconChevronDownOutlineRegular size={14} className={css.chevron} />
          </button>
        )}
      </div>
      <ul className={css.cards}>
        {visibleCards(cards, selected, expanded).map((card) => {
          const name = nameOf(card)
          const tagline = card.kind === 'general' ? t('generalTagline') : card.tagline
          return (
            <li key={card.presetId} className={css.cardItem}>
              <button type="button" className={css.card} aria-pressed={card.presetId === selected}
                title={tagline === '' ? name : `${name}\n${tagline}`} onClick={() => { void choose(card) }}>
                <Avatar key={card.kind === 'general' ? 'general' : card.avatar} avatar={card.kind === 'general' ? 'general' : card.avatar} name={name} />
                <span className={css.cardText}>
                  <span className={css.nameLine}>
                    <span className={css.name}>{name}</span>
                    {card.kind === 'employee' && card.draft && <Tag tone="neutral" className={css.draft}>{t('draft')}</Tag>}
                  </span>
                  {tagline !== '' && <span className={css.tagline}>{tagline}</span>}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
      {starters.length > 0 && (
        <ul className={css.starters} aria-label={t('starters')}>
          {starters.map(text => (
            <li key={text} className={css.starterItem}>
              <button type="button" className={css.starter} title={text} onClick={() => { insertStarter(text) }}>{text}</button>
            </li>
          ))}
        </ul>
      )}
      {toast}
    </section>
  )
}
