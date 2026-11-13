/** Shared background ownership for overlapping account overlays: interaction for every overlay, visibility for onboarding stages. */
interface BackgroundOwners {
  /** Overlays holding the element inert, and its inert state before the first of them. */
  inert: number
  previousInert: boolean
  /** Stages hiding the element, and its inline opacity before the first of them. */
  hidden: number
  previousOpacity: string
}

const owners = new WeakMap<HTMLElement, BackgroundOwners>()

function ownersOf(element: HTMLElement): BackgroundOwners {
  const existing = owners.get(element)
  if (existing !== undefined) return existing
  const created: BackgroundOwners = { inert: 0, previousInert: element.inert, hidden: 0, previousOpacity: element.style.opacity }
  owners.set(element, created)
  return created
}

function settle(element: HTMLElement, state: BackgroundOwners): void {
  if (state.inert === 0 && state.hidden === 0) owners.delete(element)
}

/**
 * Disable background interaction until every account overlay releases the element.
 * @param element - background element covered by an overlay.
 * @returns an idempotent release restoring the original inert state after the last owner.
 */
export function acquireOverlayInert(element: HTMLElement): () => void {
  const state = ownersOf(element)
  if (state.inert === 0) state.previousInert = element.inert
  state.inert++
  element.inert = true
  let released = false
  return () => {
    if (released) return
    released = true
    if (--state.inert === 0) element.inert = state.previousInert
    settle(element, state)
  }
}

/** One stage's hold on the background's visibility. */
export interface OverlayHidden {
  /** @param hidden - false while this stage fades out to reveal the background, true to hide it again. */
  setHidden(hidden: boolean): void
  /** End this stage's hold; idempotent. The stage calls `setHidden` no more after this. */
  release(): void
}

/**
 * Hide the background element until every onboarding stage reveals or releases it, so overlapping stages that end in
 * either order neither show it early nor leave it hidden.
 * @param element - background element under the stage.
 * @returns this stage's hold, starting hidden.
 */
export function acquireOverlayHidden(element: HTMLElement): OverlayHidden {
  let holding = false
  const hold = (): void => {
    if (holding) return
    holding = true
    const state = ownersOf(element)
    if (state.hidden === 0) state.previousOpacity = element.style.opacity
    state.hidden++
    element.style.opacity = '0'
  }
  const drop = (): void => {
    if (!holding) return
    holding = false
    // A holding stage keeps the record alive, so it is still the one this stage joined.
    const state = ownersOf(element)
    if (--state.hidden === 0) element.style.opacity = state.previousOpacity
    settle(element, state)
  }
  hold()
  return {
    setHidden(hidden) {
      if (hidden) hold()
      else drop()
    },
    release: drop,
  }
}
