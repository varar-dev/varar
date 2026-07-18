import type { ScannerPlugin } from '@varar/core'

// Spec-doc discovery globs. `include` is globbed; anything also matching
// `exclude` is dropped. Both are plain globs — no `!` prefix semantics.
export type VarGlobs = {
  readonly include: ReadonlyArray<string>
  readonly exclude: ReadonlyArray<string>
}

// The parsed, unresolved shape of var.config.json — pure data, shared
// byte-for-byte with the Python/Java/Kotlin readers (see
// conformance/config/README.md). Scanner plugins are NAMES here.
export type ParsedVarConfig = {
  readonly docs: VarGlobs
  readonly steps: ReadonlyArray<string>
  readonly snippets: Readonly<Record<string, string>>
  readonly scannerPlugins: ReadonlyArray<string>
}

// The resolved config consumers receive: plugin names looked up against
// var-core's registry. `scannerPluginNames` is kept alongside the resolved
// instances because the vitest plugin generates source code and needs the
// names to re-resolve inside the generated module.
export type VarConfig = {
  readonly docs: VarGlobs
  readonly steps: ReadonlyArray<string>
  readonly snippets: Readonly<Record<string, string>>
  readonly scannerPlugins: ReadonlyArray<ScannerPlugin>
  readonly scannerPluginNames: ReadonlyArray<string>
}
