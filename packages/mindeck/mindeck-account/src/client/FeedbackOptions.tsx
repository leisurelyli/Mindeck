/** The Mindeck rows of the base feedback dialog: where the feedback goes, and the choice to attach a rated answer's round. */
import { Checkbox } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-message-feedback/client'
import { useEffect, useState } from 'react'
import css from './Account.module.css'

/** Business face of the rows for one Session's dialog. */
export interface MindeckFeedbackOptionsInjected {
  /**
   * Record the member's choice for the dialog of this Session, which the submission reads.
   * @param attach - whether the round's question and answer go along with a rating down.
   */
  choose: (attach: boolean) => void
}

/** Composed rows props. */
export type FeedbackOptionsProps = PropsRuntime<'feedback.dialog.options'> & PropsLocale<'mindeckAccount'>
  & InjectFace<MindeckFeedbackOptionsInjected>

/**
 * A rating down offers to attach the round's question and answer, unticked each time the dialog opens, and says that
 * administrators read them only when ticked; a written remark says it goes to the administrators without conversation
 * content; a rating up says it stays on this computer.
 * @param props - the open target, whether a submission runs, the choice recorder, and localized copy.
 * @returns the rows for the open target.
 */
export function FeedbackOptions({ target, submitting, choose, t }: FeedbackOptionsProps) {
  const [attach, setAttach] = useState(false)
  // Each opening starts unticked, including over a choice a closed dialog left behind.
  useEffect(() => { choose(attach) }, [attach, choose])
  if (target.kind === 'session') return <p className={css.feedbackNote}>{t('feedbackReportNote')}</p>
  if (target.rating === 'positive') return <p className={css.feedbackNote}>{t('feedbackLikeNote')}</p>
  return <div className={css.feedbackOptions}>
    <Checkbox checked={attach} disabled={submitting} label={t('feedbackAttachExcerpt')}
      onChange={(next) => { setAttach(next); choose(next) }} />
    <p className={css.feedbackNote}>{t('feedbackAttachNote')}</p>
  </div>
}
