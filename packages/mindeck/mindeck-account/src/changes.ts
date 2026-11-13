/** Change-notice streams shared by the Mindeck Host services. */

/**
 * Follow a value that its service reads again after each change notice. Notices that arrive while the reader is
 * busy collapse into one read.
 * @param listeners - the service's change listeners; the stream adds its wake-up while it runs.
 * @param signal - stream lifetime.
 * @param lifetime - the service's lifetime; once it is aborted, the stream ends at its next wake-up.
 * @param read - reads the current value.
 * @returns the current value, then the value read after each change.
 */
export async function* followChanges<T>(
  listeners: Set<() => void>, signal: AbortSignal, lifetime: AbortSignal, read: () => T | Promise<T>,
): AsyncGenerator<T> {
  let dirty = true
  let wake: (() => void) | undefined
  const wakeUp = (): void => { dirty = true; wake?.() }
  listeners.add(wakeUp)
  signal.addEventListener('abort', wakeUp, { once: true })
  try {
    while (!signal.aborted && !lifetime.aborted) {
      if (dirty) { dirty = false; yield await read(); continue }
      await new Promise<void>((resolve) => { wake = resolve })
    }
  } finally {
    listeners.delete(wakeUp)
    signal.removeEventListener('abort', wakeUp)
  }
}
