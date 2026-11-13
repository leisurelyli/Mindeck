/** The skills page in the main column: the company's skills by recommendation and category, their instructions, and a start action. */
import { useEffect, useId, useMemo, useState } from 'react'
import {
  Button, DetailDocument, detailDocumentState, IconCloseOutlineRegular, IconSearchOutlineRegular, IconSkillOutlineRegular, Input,
  Modal, useDetailDocumentLabels,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type { MindeckSkillView } from '../types.ts'
import type { MindeckSkillsKey } from './locales.ts'
import type { InstructionsRead, MindeckSkillsInjected } from './operations.ts'
import { type SectionHeading, skillSections } from './sections.ts'
import css from './SkillsPage.module.css'

/** Composed page props. */
export type SkillsPageProps = PropsRuntime<'main'> & PropsLocale<'mindeckSkills'> & InjectFace<MindeckSkillsInjected>

/** Placeholder cards while the listing loads. */
const SKELETON_CARDS = 4

/** The name a member reads for a skill. */
function titleOf(skill: MindeckSkillView): string {
  return skill.displayName ?? skill.name
}

/**
 * @param props.skill - the skill whose instructions are shown.
 * @param props.busy - whether a conversation is opening.
 * @param props.read - reads the instructions.
 * @param props.onUse - starts a conversation with the skill.
 * @param props.onClose - closes the dialog.
 * @param props.t - page copy.
 * @returns the instructions dialog.
 */
function InstructionsDialog({ skill, busy, read, onUse, onClose, t }: {
  skill: MindeckSkillView
  busy: boolean
  read: (name: string) => Promise<InstructionsRead>
  onUse: () => void
  onClose: () => void
  t: SkillsPageProps['t']
}) {
  const [result, setResult] = useState<InstructionsRead | undefined>(undefined)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let current = true
    setResult(undefined)
    void read(skill.name).then((value) => { if (current) setResult(value) })
    return () => { current = false }
  }, [read, skill.name, attempt])
  const labels = useDetailDocumentLabels({
    title: t('instructionsTitle', { name: titleOf(skill) }), loading: t('instructionsLoading'), retry: t('retry'),
    copy: t('copy'), copied: t('copied'), codeBlock: t('codeBlock'), wrap: t('wrap'), unwrap: t('unwrap'), footnotes: t('footnotes'),
  })
  const markdown = result?.ok === true && result.markdown.trim() !== '' ? result.markdown : undefined
  const state = detailDocumentState(result === undefined ? { status: 'loading' }
    : result.ok ? { status: 'ready', markdown }
      : { status: 'error', message: t(result.reason === 'missing' ? 'instructionsMissing' : 'instructionsFailed') })
  return (
    <Modal open onClose={onClose} title={titleOf(skill)} closeLabel={t('close')} className={css.dialog as string}
      footer={<>
        <Button variant="ghost" onClick={onClose}>{t('close')}</Button>
        <Button variant="primary" disabled={busy} onClick={onUse}>{t('use')}</Button>
      </>}>
      <div className={css.dialogBody}>
        <p className={css.dialogMeta}>
          <span className={css.command}>/{skill.name}</span>
          {skill.category !== null && <span className={css.category}>{skill.category}</span>}
        </p>
        {skill.description !== '' && <p className={css.dialogDescription}>{skill.description}</p>}
        {state.status === 'none' ? <p className={css.dialogEmpty}>{t('instructionsEmpty')}</p>
          : <DetailDocument state={state} labels={labels} onRetry={() => { setAttempt(value => value + 1) }} />}
      </div>
    </Modal>
  )
}

/**
 * @param props.skill - the skill.
 * @param props.showCategory - whether the card names its category, as it does outside its category's section.
 * @param props.busy - whether a conversation is opening.
 * @param props.onUse - starts a conversation with the skill.
 * @param props.onPreview - opens the skill's instructions.
 * @param props.t - page copy.
 * @returns one skill card.
 */
function SkillCard({ skill, showCategory, busy, onUse, onPreview, t }: {
  skill: MindeckSkillView
  showCategory: boolean
  busy: boolean
  onUse: () => void
  onPreview: () => void
  t: SkillsPageProps['t']
}) {
  const titleId = useId()
  const title = titleOf(skill)
  return (
    <article className={css.card} aria-labelledby={titleId}>
      <div className={css.cardText}>
        <h3 id={titleId} className={css.cardTitle}>{title}</h3>
        <p className={css.cardMeta}>
          <span className={css.command}>/{skill.name}</span>
          {showCategory && skill.category !== null && <span className={css.category}>{skill.category}</span>}
        </p>
        <p className={css.description}>{skill.description}</p>
      </div>
      <div className={css.actions}>
        <Button variant="ghost" size="sm" aria-label={t('previewSkill', { name: title })} onClick={onPreview}>{t('preview')}</Button>
        <Button variant="outline" size="sm" aria-label={t('useSkill', { name: title })} disabled={busy} onClick={onUse}>{t('use')}</Button>
      </div>
    </article>
  )
}

/**
 * Registered while the member is signed in to Mindeck: a search over names, categories, descriptions, and pinyin;
 * the company's recommended skills first, then each category; each skill opens a conversation with `/name ` in the
 * message box or shows its SKILL.md in a dialog.
 * @param props - the listing, the page operations, and localized copy.
 * @returns the page.
 */
export function SkillsPage({ t, useCatalog, use, instructions }: SkillsPageProps) {
  const catalog = useCatalog(snapshot => snapshot.catalog)
  const failed = useCatalog(snapshot => snapshot.failed)
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [reading, setReading] = useState<MindeckSkillView | null>(null)
  const titleId = useId()
  const company = catalog?.skills
  const sections = useMemo(() => skillSections(company ?? [], query), [company, query])
  const start = (name: string): void => {
    if (busy) return
    setBusy(true)
    void use(name).finally(() => { setBusy(false) })
  }
  const heading = (value: SectionHeading): string => {
    switch (value.kind) {
      case 'recommended': return t('recommended')
      case 'category': return value.name
      case 'other': return t('other')
    }
  }
  const unavailable: MindeckSkillsKey | null = catalog === undefined ? (failed ? 'unavailable' : null)
    : catalog.company === null ? 'signedOut' : null
  const intro = catalog?.company != null && catalog.skills.length > 0
    ? t('intro', { company: catalog.company, count: String(catalog.skills.length) })
    : t('introPending')

  let body
  if (unavailable !== null) {
    body = <p className={css.notice} role="status">{t(unavailable)}</p>
  } else if (catalog === undefined) {
    body = (
      <ul className={css.grid} role="status" aria-label={t('loading')} aria-busy="true">
        {Array.from({ length: SKELETON_CARDS }, (_, index) => <li key={index} className={css.skeleton} />)}
      </ul>
    )
  } else if (catalog.skills.length === 0) {
    body = (
      <div className={css.empty} role="status">
        <span className={css.emptyIcon} aria-hidden="true"><IconSkillOutlineRegular size={24} /></span>
        <p className={css.emptyTitle}>{t('noCompanySkills')}</p>
        <p className={css.emptyHint}>{t('noCompanySkillsHint')}</p>
      </div>
    )
  } else {
    body = (
      <>
        {sections.length === 0 && (
          <div className={css.empty} role="status">
            <p className={css.emptyTitle}>{t('noResults', { query: query.trim() })}</p>
            <Button variant="outline" size="sm" onClick={() => { setQuery('') }}>{t('clearSearch')}</Button>
          </div>
        )}
        {sections.map(section => (
          <section key={section.key} className={css.section} aria-labelledby={`${titleId}-${section.key}`}>
            <h2 id={`${titleId}-${section.key}`} className={css.sectionTitle}>{heading(section.heading)}</h2>
            <ul className={css.grid}>
              {section.skills.map(skill => (
                <li key={skill.name} className={css.item}>
                  <SkillCard skill={skill} showCategory={section.heading.kind !== 'category'} busy={busy} t={t}
                    onUse={() => { start(skill.name) }} onPreview={() => { setReading(skill) }} />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </>
    )
  }

  const searchable = unavailable === null && catalog !== undefined && catalog.skills.length > 0
  // The heading and the search stay in place while the sections scroll beneath them.
  return (
    <section className={css.page} aria-labelledby={titleId}>
      <header className={css.head}>
        <div className={css.column}>
          <h1 id={titleId} className={css.title}>{t('title')}</h1>
          <p className={css.intro}>{intro}</p>
          {searchable && (
            <div className={css.search}>
              <Input type="search" className={css.searchInput as string} icon={<IconSearchOutlineRegular size={16} />} value={query}
                placeholder={t('searchPlaceholder')} aria-label={t('searchPlaceholder')} onChange={(event) => { setQuery(event.currentTarget.value) }} />
              {query !== '' && (
                <button type="button" className={css.clear} aria-label={t('clearSearch')} onClick={() => { setQuery('') }}>
                  <IconCloseOutlineRegular size={14} />
                </button>
              )}
            </div>
          )}
        </div>
      </header>
      <div className={css.scroll}>
        <div className={`${css.column} ${css.body}`}>{body}</div>
      </div>
      {reading !== null && (
        <InstructionsDialog skill={reading} busy={busy} read={instructions} t={t}
          onUse={() => { const { name } = reading; setReading(null); start(name) }} onClose={() => { setReading(null) }} />
      )}
    </section>
  )
}
