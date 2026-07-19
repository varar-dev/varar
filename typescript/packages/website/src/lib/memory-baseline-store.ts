import type { BaselineStore } from '@varar/core'

// The browser's BaselineStore: the drift baseline (varar.lock.json) held in a
// single string in memory. There is no filesystem to commit to in the browser,
// so a fresh page load starts from no baseline — the first run of each spec
// records it, and editing takes it from there. The core owns the format
// (parseVarLock / stringifyVarLock); this adapter only holds the text.
export function createMemoryBaselineStore(initial: string | null = null): BaselineStore {
  let contents = initial
  return {
    read: () => contents,
    write: (next: string) => {
      contents = next
    },
  }
}
