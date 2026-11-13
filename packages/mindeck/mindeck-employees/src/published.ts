/** One published JSON value and the streams that follow it. */
import { deepEqualJson } from '@deepseek-ai/dsh-util-values'

/** Holds the latest value; streams receive it first, then each change, and skip equal republications. */
export class PublishedValue<T> {
  private readonly waiters = new Set<() => void>()

  /** @param value - the value before the first publication. */
  constructor(private value: T) {}

  /**
   * Replace the value unless it equals the current one as JSON, then wake every stream.
   * @param next - the new value.
   */
  publish(next: T): void {
    if (deepEqualJson(next, this.value)) return
    this.value = next
    for (const wake of this.waiters) wake()
  }

  /**
   * Follow the value until the signal ends.
   * @param signal - stream lifetime.
   * @returns the current value, then each new value; values published while the reader is busy collapse to the latest.
   */
  async *follow(signal: AbortSignal): AsyncIterable<T> {
    let shown: { readonly value: T } | undefined
    while (!signal.aborted) {
      if (shown === undefined || shown.value !== this.value) {
        shown = { value: this.value }
        yield shown.value
        continue
      }
      await this.changed(signal)
    }
  }

  /** Resolve at the next publication or when the signal ends. */
  private async changed(signal: AbortSignal): Promise<void> {
    const { promise, resolve } = Promise.withResolvers<void>()
    const wake = (): void => { resolve() }
    this.waiters.add(wake)
    signal.addEventListener('abort', wake, { once: true })
    try { await promise } finally {
      this.waiters.delete(wake)
      signal.removeEventListener('abort', wake)
    }
  }
}
