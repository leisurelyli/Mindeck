// @vitest-environment jsdom
/**
 * The account-neutral first-run page draws caller content in the onboarding stage: hero and centered layouts, a form
 * that submits on Enter, a back control, focus on each new page, the Desktop width request, and the exit fade.
 * Overlapping stages share the root's hidden state, so ending them in either order neither reveals nor strands it.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { PropsRenderSlots } from '@deepseek-ai/dsh-client-ui-slots'
import { OnboardingPage } from '../src/client/OnboardingPage.tsx'
import { OnboardingSurface } from '../src/client/OnboardingSurface.tsx'
import { AccountIdentity, AccountLinks, AccountRows } from '../src/client/AccountParts.tsx'
import type { OnboardingPageInput } from '../src/client/onboarding-contract.ts'

let appRoot: HTMLDivElement
beforeEach(() => {
  appRoot = document.createElement('div')
  appRoot.id = 'root'
  appRoot.inert = false
  document.body.appendChild(appRoot)
})
afterEach(() => { cleanup(); appRoot.remove(); vi.unstubAllGlobals() })

const fallbackSlots: PropsRenderSlots<'desktop.onboarding.page.illustration'> = {
  renderSlot: (_key, _owner, options) => options?.fallback ?? null,
}
const page = (input: Partial<OnboardingPageInput> = {}) =>
  <OnboardingPage page="one" layout="centered" locale="en" title="Connect" {...fallbackSlots} {...input} />

it('draws a hero with the brand word, its actions, and artwork from the illustration slot', () => {
  const start = vi.fn()
  const owners: unknown[] = []
  render(<OnboardingPage page="welcome" layout="hero" locale="zh" title="欢迎使用" brand="Mindeck" description="一句介绍。"
    actions={[{ key: 'start', label: '开始', variant: 'primary', onClick: start }]}
    renderSlot={(_key, owner) => { owners.push(owner); return <i data-artwork /> }} />)
  expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('欢迎使用 Mindeck')
  expect(screen.getByText('一句介绍。')).toBeTruthy()
  expect(document.querySelector('[data-artwork]')).not.toBeNull()
  expect(owners[0]).toMatchObject({ step: 'welcome', locale: 'zh' })
  fireEvent.click(screen.getByRole('button', { name: '开始' }))
  expect(start).toHaveBeenCalledOnce()
  expect(document.querySelector('section')?.getAttribute('lang')).toBe('zh')
})

it('submits a hero form, styles only its first action as the start, and adds the brand word to a centered title', () => {
  const submit = vi.fn()
  const view = render(<OnboardingPage page="intro" layout="hero" locale="en" title="Welcome" onSubmit={submit} {...fallbackSlots}
    actions={[{ key: 'go', label: 'Go', variant: 'primary', submit: true }, { key: 'later', label: 'Later', variant: 'outline' }]} />)
  expect(screen.getByRole('button', { name: 'Go' }).className).not.toBe(screen.getByRole('button', { name: 'Later' }).className)
  fireEvent.click(screen.getByRole('button', { name: 'Go' }))
  expect(submit).toHaveBeenCalledOnce()
  view.rerender(<OnboardingPage page="wait" layout="status" locale="en" title="Loading" onSubmit={submit} {...fallbackSlots} />)
  expect(document.querySelector('form')).toBeNull()
  view.rerender(page({ page: 'named', title: 'Welcome to', brand: 'Mindeck' }))
  expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Welcome to Mindeck')
})

it('submits a centered form on Enter, offers a back control, and disables both while busy', () => {
  const submit = vi.fn()
  const back = vi.fn()
  const view = render(page({
    description: 'Enter the address.', body: <input aria-label="Address" />, onSubmit: submit,
    actions: [{ key: 'go', label: 'Continue', variant: 'primary', submit: true }], back: { label: 'Back', onClick: back },
  }))
  fireEvent.submit(screen.getByLabelText('Address').closest('form')!)
  expect(submit).toHaveBeenCalledOnce()
  fireEvent.click(screen.getByRole('button', { name: 'Back' }))
  expect(back).toHaveBeenCalledOnce()
  view.rerender(page({
    busy: true, body: <input aria-label="Address" />, onSubmit: submit,
    actions: [{ key: 'go', label: 'Continue', variant: 'primary', submit: true }], back: { label: 'Back', onClick: back },
  }))
  expect(screen.getByRole('button', { name: 'Continue' }).hasAttribute('disabled')).toBe(true)
  expect(screen.getByRole('button', { name: 'Back' }).hasAttribute('disabled')).toBe(true)
  fireEvent.submit(screen.getByLabelText('Address').closest('form')!)
  expect(submit).toHaveBeenCalledOnce()
  expect(document.querySelector('section')?.getAttribute('aria-busy')).toBe('true')
})

it('focuses each new page heading unless a body control took focus, and asks Desktop for the onboarding width', () => {
  const setActive = vi.fn()
  vi.stubGlobal('dshOnboarding', { setActive })
  const view = render(page())
  expect(document.activeElement?.textContent).toBe('Connect')
  expect(setActive).toHaveBeenLastCalledWith(true)
  view.rerender(page({ page: 'two', title: 'Confirm', body: <input aria-label="Sign-in code" autoFocus /> }))
  expect(document.activeElement).toBe(screen.getByLabelText('Sign-in code'))
  view.rerender(page({ page: 'three', layout: 'status', title: 'Loading' }))
  expect(screen.getByRole('status').textContent).toBe('Loading')
  expect(screen.queryByRole('heading')).toBeNull()
  view.unmount()
  expect(setActive).toHaveBeenLastCalledWith(false)
})

it('reveals the workspace while the caller fades the page out', () => {
  const view = render(page())
  expect(appRoot.style.opacity).toBe('0')
  expect(appRoot.inert).toBe(true)
  view.rerender(page({ exiting: true }))
  expect(appRoot.style.opacity).toBe('')
  expect(document.querySelector('[data-exiting]')).not.toBeNull()
  view.unmount()
  expect(appRoot.inert).toBe(false)
})

it.each(['first', 'second'] as const)('keeps the root hidden until both overlapping stages end, ending the %s one first', (first) => {
  appRoot.style.opacity = '0.9'
  const one = render(<OnboardingSurface>one</OnboardingSurface>)
  const two = render(<OnboardingSurface>two</OnboardingSurface>)
  ;(first === 'first' ? one : two).unmount()
  expect(appRoot.style.opacity).toBe('0')
  expect(appRoot.inert).toBe(true)
  ;(first === 'first' ? two : one).unmount()
  expect(appRoot.style.opacity).toBe('0.9')
  expect(appRoot.inert).toBe(false)
})

it('keeps the root hidden while one stage fades out over another, then restores it', () => {
  const below = render(<OnboardingSurface>below</OnboardingSurface>)
  const above = render(<OnboardingSurface>above</OnboardingSurface>)
  above.rerender(<OnboardingSurface exiting>above</OnboardingSurface>)
  expect(appRoot.style.opacity).toBe('0')
  above.rerender(<OnboardingSurface>above</OnboardingSurface>)
  act(() => { below.unmount() })
  expect(appRoot.style.opacity).toBe('0')
  above.unmount()
  expect(appRoot.style.opacity).toBe('')
})

it('draws account page parts other account pages compose: identity, rows with dividers, and link or button actions', () => {
  const signOut = vi.fn()
  const view = render(<>
    <AccountIdentity avatar="L" name="Lin" status="lin@example.com" link={{ label: 'Console', href: 'https://cloud.example.com' }}
      actions={<AccountLinks links={[{ key: 'out', label: 'Sign out', onClick: signOut }]} />} />
    <AccountRows rows={[{ key: 'a', label: 'Company', value: 'Xinghe' }, { key: 'b', label: 'More', muted: true, value: 'x' }]} />
  </>)
  expect(screen.getByRole('status').textContent).toBe('lin@example.com')
  expect(screen.getByRole('link', { name: 'Console' }).getAttribute('target')).toBe('_blank')
  fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))
  expect(signOut).toHaveBeenCalledOnce()
  expect(view.container.querySelectorAll('[class*="divider"]')).toHaveLength(1)
  render(<AccountLinks links={[{ key: 'help', label: 'Help', href: 'https://cloud.example.com/help', disabled: true }]} />)
  expect(screen.getByRole('link', { name: 'Help' }).getAttribute('aria-disabled')).toBe('true')
})
