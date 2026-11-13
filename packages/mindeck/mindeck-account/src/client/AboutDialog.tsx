/** Edition, version, the company and its Mindeck Cloud, and where to read about data handling. */
import { Button, IconCloseOutlineRegular, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { MindeckClientRelease } from '../types.ts'
import type { MindeckAccountKey } from './locales.ts'
import css from './Account.module.css'

/**
 * The download action opens the company's installer for this computer when it has one, otherwise the Mindeck Cloud
 * home page, which lists the installers.
 * @param props - build version, the account's company, Cloud address, administrator contact, and recommended version,
 *   dialog close, and localized copy.
 * @returns the about dialog.
 */
export function AboutDialog({ appVersion, companyName, cloudUrl, adminContact, release, close, t }: {
  appVersion: string
  companyName: string | null
  cloudUrl: string | null
  /** How members reach an administrator; null when the company set none. */
  adminContact: string | null
  /** The company's recommended version; null without one. */
  release: MindeckClientRelease | null
  close: () => void
  t: (key: MindeckAccountKey) => string
}) {
  const open = (path: string): void => { if (cloudUrl !== null) window.open(`${cloudUrl}${path}`, '_blank', 'noopener,noreferrer') }
  const recommended = release?.recommendedVersion ?? null
  const installer = release?.downloadUrl ?? null
  return <Modal open headless title={t('aboutTitle')} onClose={close} className={css.dialog as string}>
    <div className={css.dialogHeader}>
      <h2 className={css.dialogTitle}>{t('aboutTitle')}</h2>
      <button type="button" className={css.close} aria-label={t('close')} onClick={close}>
        <IconCloseOutlineRegular size={14} />
      </button>
    </div>
    <dl className={css.facts}>
      <dt>{t('aboutEdition')}</dt>
      <dd>{appVersion === '' ? '—' : `${t('aboutVersion')} ${appVersion}`}</dd>
      {recommended !== null && <><dt>{t('aboutRecommended')}</dt><dd>{recommended}</dd></>}
      {companyName !== null && <><dt>{t('company')}</dt><dd>{companyName}</dd></>}
      {cloudUrl !== null && <><dt>{t('cloudAddress')}</dt><dd className={css.mono}>{cloudUrl}</dd></>}
      {adminContact !== null && <><dt>{t('aboutContact')}</dt><dd>{adminContact}</dd></>}
    </dl>
    <p className={`${css.dialogText} ${css.dialogNote}`}>{t('aboutPrivacyNote')}</p>
    <div className={css.dialogActions}>
      {cloudUrl !== null && <>
        <Button variant="outline" onClick={() => { open('/privacy') }}>{t('aboutPrivacy')}</Button>
        <Button variant="outline" onClick={() => {
          if (installer === null) open('/')
          else window.open(installer, '_blank', 'noopener,noreferrer')
        }}>{t('aboutDownloads')}</Button>
      </>}
      <Button variant="primary" onClick={close}>{t('close')}</Button>
    </div>
  </Modal>
}
