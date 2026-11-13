/** A published value streams its current value, then each change, skips equal republications, and ends with its signal. */
import { expect, it, vi } from 'vitest'
import { PublishedValue } from '../src/published.ts'

it('streams the current value and later changes, skipping equal values, until the signal ends', async () => {
  const value = new PublishedValue({ cards: ['a'] })
  const stop = new AbortController()
  const frames: unknown[] = []
  const reading = (async () => { for await (const frame of value.follow(stop.signal)) frames.push(frame) })()
  await vi.waitFor(() => { expect(frames).toEqual([{ cards: ['a'] }]) })
  value.publish({ cards: ['a'] })
  value.publish({ cards: ['a', 'b'] })
  await vi.waitFor(() => { expect(frames).toEqual([{ cards: ['a'] }, { cards: ['a', 'b'] }]) })
  stop.abort()
  await reading
  value.publish({ cards: [] })
  expect(frames).toHaveLength(2)
})
