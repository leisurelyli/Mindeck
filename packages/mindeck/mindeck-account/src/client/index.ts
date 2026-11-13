/** Browser entry for the Mindeck account: full-screen sign-in, settings section, sidebar launcher, and the `mindeckComposer` service. */
import type { Context } from '@deepseek-ai/cordis'
import remote from '@deepseek-ai/dsh-mindeck-account/remote'
import { mountAccount } from './mount.ts'

export { inject } from './mount.ts'
export type { MindeckAccountKey } from './locales.ts'
export type { MindeckComposer, MindeckConversationRequest, MindeckDraft } from './composer.ts'
export type { MindeckAccountInjected, MindeckAccountSnapshot, OperationOutcome } from './operations.ts'
export type { AccountMenuProps } from './AccountMenu.tsx'
export type { AccountSectionProps } from './AccountSection.tsx'
export type { MindeckOnboardingProps } from './MindeckOnboarding.tsx'

/**
 * Mount the account Remote, then the account UI.
 * @param ctx - browser plugin context.
 * @returns disposer withdrawing the UI before the Remote.
 */
export async function apply(ctx: Context): Promise<() => Promise<void>> { return await mountAccount(ctx, remote) }
