import type { Diagnostic } from './diagnostics.ts'

export interface TestSink {
  example(
    name: string,
    run: () => void | Promise<void>,
    info?: { readonly lines: ReadonlyArray<number> }, // 1-based source lines of the example's steps
  ): void
}

export interface Reporter {
  diagnostic(d: Diagnostic): void
}

// Persistence port for the drift baseline (`var.lock.json`). The core owns the
// format (parseVarLock / stringifyVarLock) and reads/writes raw text through
// this port, so adapters stay dumb I/O: a filesystem store on Node (CLI,
// vitest), an in-memory store in the browser. `read` returns the whole
// lockfile's contents, or null when there is no baseline yet.
export interface BaselineStore {
  read(): string | null | Promise<string | null>
  write(contents: string): void | Promise<void>
}
