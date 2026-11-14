/**
 * One Session's feedback surface: the message-feedback object layer and the
 * dialog controller, plus the routing between them. A message target puts a
 * selected judgment through the message controller; the Session target records
 * through the `sessionFeedback` Remote.
 * @module @deepseek-ai/dsh-client-ui-message-feedback/client/surface
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { FeedbackRecord } from '@deepseek-ai/dsh-command-feedback/types'
import { MessageFeedbackController, describe, type MessageFeedbackActionResult } from './controller.ts'
import { FeedbackDialogController, type FeedbackDialogTarget } from './dialog.ts'

/**
 * Work another plugin finishes before a dialog submission records its feedback, such as sending a choice from its
 * `feedback.dialog.options` entry to its Host.
 * @param sessionId - Session the dialog belongs to.
 * @param target - what the submission records against.
 * @returns after the work; a rejection fails the submission, which keeps the dialog open.
 */
export type FeedbackSubmitHook = (sessionId: SessionId, target: FeedbackDialogTarget) => Promise<void>

/** The per-session pair behind every entry of one Session. */
export class FeedbackSurface {
  /** The Session's message-feedback object layer, shared by every message control. */
  readonly feedback: MessageFeedbackController
  /** The Session's dialog and toast state, shared by the overlay entry and the message controls. */
  readonly dialog: FeedbackDialogController

  /**
   * @param ctx - the browser plugin context carrying both feedback Remotes.
   * @param sessionId - Session owning the transcript and the remark.
   * @param hooks - hooks every submission awaits first, in registration order; read at each submission.
   */
  constructor(
    private readonly ctx: ClientContext, private readonly sessionId: SessionId,
    private readonly hooks: ReadonlySet<FeedbackSubmitHook> = new Set(),
  ) {
    this.feedback = new MessageFeedbackController(ctx.remote.messageFeedback, sessionId)
    this.dialog = new FeedbackDialogController(async (target, entry) => {
      const prepared = await this.prepare(target)
      if (!prepared.ok) return prepared
      return target.kind === 'message' ? await this.feedback.rate(target.messageId, target.rating, entry) : await this.recordSession(entry)
    })
  }

  /** Run every submit hook; the first failure stops the submission with the generic failure. */
  private async prepare(target: FeedbackDialogTarget): Promise<MessageFeedbackActionResult> {
    for (const hook of [...this.hooks]) {
      try { await hook(this.sessionId, target) }
      catch (error) {
        return { ok: false, error: { code: 'submit-hook-failed', message: error instanceof Error ? error.message : String(error) } }
      }
    }
    return { ok: true }
  }

  /** Record one Session-level remark through the sessionFeedback Remote. */
  private async recordSession(entry: FeedbackRecord): Promise<MessageFeedbackActionResult> {
    const carried = await this.ctx.remote.sessionFeedback.record({ sessionId: this.sessionId, ...entry })
    if (!carried.ok) return { ok: false, error: { code: carried.error.code, message: carried.error.message } }
    if (carried.value.ok) return { ok: true }
    return { ok: false, error: { code: carried.value.error.code, message: describe(carried.value.error.code) } }
  }

  /** Drop both controllers when the owning fiber unloads. */
  dispose(): void {
    this.feedback.dispose()
    this.dialog.dispose()
  }
}
