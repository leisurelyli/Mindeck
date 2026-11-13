/** Sidebar page that lists the company's skills and Mindeck's own, and puts one in the message draft. */
import { useEffect, useMemo, useState } from 'react'
import { IconInfoOutlineRegular, IconSearchOutlineRegular, Input, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { MindeckSkillsKey } from './locales.ts'
import type { MindeckSkillsInjected } from './operations.ts'
import { type SectionHeading, type SessionSkill, skillSections } from './sections.ts'
import css from './Skills.module.css'

/** Composed page props. */
export type SkillsPanelProps = PropsRuntime<'sidebar.right.pane.tab'> & PropsLocale<'mindeckSkills'> & InjectFace<MindeckSkillsInjected>

/** How long the "put in the message box" confirmation stays. */
const NOTICE_MS = 2000

/**
 * @param props - the company listing, the conversation's skills, the draft action, and localized copy.
 * @returns the skills page.
 */
export function SkillsPanel({ t, useCatalog, sessionSkills, useSkill, preview }: SkillsPanelProps) {
  const catalog = useCatalog(snapshot => snapshot.catalog)
  const failed = useCatalog(snapshot => snapshot.failed)
  const [session, setSession] = useState<readonly SessionSkill[] | undefined>(undefined)
  const [query, setQuery] = useState('')
  const [notice, setNotice] = useState<MindeckSkillsKey | null>(null)

  // The conversation's catalog changes with the company's: read it again whenever the listing does.
  useEffect(() => {
    let current = true
    void sessionSkills().then((skills) => { if (current) setSession(skills) }, () => { if (current) setSession(undefined) })
    return () => { current = false }
  }, [catalog, sessionSkills])

  useEffect(() => {
    if (notice === null) return
    const timer = setTimeout(() => { setNotice(null) }, NOTICE_MS)
    return () => { clearTimeout(timer) }
  }, [notice])

  const company = catalog?.skills ?? []
  const sections = useMemo(() => skillSections(company, session, query), [company, session, query])
  const searching = query.trim() !== ''
  const heading = (value: SectionHeading): string => {
    switch (value.kind) {
      case 'recommended': return t('recommended')
      case 'category': return value.name
      case 'other': return t('other')
      case 'built-in': return t('builtIn')
    }
  }
  const companyState: MindeckSkillsKey | null = catalog === undefined ? (failed ? 'unavailable' : 'loading')
    : catalog.company === null ? 'signedOut' : company.length === 0 ? 'noCompanySkills' : null

  return (
    <div className={css.page}>
      <div className={css.search}>
        <Input className={css.searchInput as string} icon={<IconSearchOutlineRegular size={16} />} type="search" value={query}
          placeholder={t('searchPlaceholder')} aria-label={t('searchPlaceholder')} onChange={(event) => { setQuery(event.currentTarget.value) }} />
      </div>
      <div className={css.body}>
        {!searching && (
          <div className={css.intro}>
            <p className={css.caption}>
              {companyState === null && catalog?.company != null
                ? t('provided', { company: catalog.company, count: String(company.length) })
                : t(companyState ?? 'loading')}
            </p>
            <p className={css.hint}>{t('hint')}</p>
          </div>
        )}
        {searching && sections.length === 0 && <p className={css.state}>{t('noResults')}</p>}
        {sections.map(section => (
          <section key={section.key} className={css.section} aria-labelledby={`mindeck-skills-${section.key}`}>
            <h3 id={`mindeck-skills-${section.key}`} className={css.heading}>{heading(section.heading)}</h3>
            <ul className={css.list}>
              {section.rows.map(row => (
                <li key={row.name} className={css.row}>
                  <button type="button" className={css.action} aria-label={`${t('use')}: ${row.title}`}
                    onClick={() => { setNotice(useSkill(row.name) ? 'used' : 'useFailed') }}>
                    <span className={css.titleLine}>
                      <span className={css.title}>{row.title}</span>
                      {row.title !== row.name && <span className={css.command}>/{row.name}</span>}
                    </span>
                    {row.description !== '' && <span className={css.description}>{row.description}</span>}
                  </button>
                  {row.path !== undefined && (
                    <span className={css.accessory}>
                      <Tooltip label={t('preview')} side="left">
                        <button type="button" className={css.iconButton} aria-label={`${t('preview')}: ${row.title}`}
                          onClick={() => { if (row.path !== undefined) preview(row.path) }}>
                          <IconInfoOutlineRegular size={16} />
                        </button>
                      </Tooltip>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <p className={css.notice} role="status" aria-live="polite">{notice === null ? '' : t(notice)}</p>
    </div>
  )
}
