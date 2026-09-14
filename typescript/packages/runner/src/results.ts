import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, sep } from 'node:path'
import { type ExampleResult, hashSource, type OathResults } from '@varar/core'

/**
 * Persists run results for the language server (ADR 0014) — the shell half of
 * the contract the core builds the payload for.
 *
 * Lives in the runner, not in an adapter, so every producer feeds the same
 * writer — which is how the other ports are arranged too
 * (python/packages/runner/results.py,
 * ruby/packages/runner/lib/varar/runner/results.rb, rust/runner/src/results.rs).
 * While it lived inside @varar/vitest instead, anything that was not the vitest
 * adapter structurally could not reach it, and the LSP stayed blank after those
 * runs while every other port's runner filled it in.
 */

/** Absolute filepath → POSIX oath path relative to cwd. */
export function toOathPath(filepath: string, cwd: string): string {
  const rel = isAbsolute(filepath) ? relative(cwd, filepath) : filepath
  return rel.split(sep).join('/')
}

/** Oath path → its result file under `.varar/`. */
export function resultFilePath(oathPath: string, cwd: string): string {
  return join(cwd, '.varar', `${oathPath}.json`)
}

// Examples in document order.
//
// The producer's own order is whatever its runner scheduled — vitest reports in
// declaration order, but the other ports had to sort (unittest orders by method
// name, minitest randomises, cargo runs in parallel). The file is a cross-port
// contract read by tools that diff runs, so the order is stated here rather
// than inherited. The name breaks ties for examples sharing a line.
function documentOrder(examples: ReadonlyArray<ExampleResult>): ReadonlyArray<ExampleResult> {
  return [...examples].sort(
    (a, b) => (a.lines[0] ?? 0) - (b.lines[0] ?? 0) || a.name.localeCompare(b.name),
  )
}

export function buildOathResults(
  oathPath: string,
  source: string,
  examples: ReadonlyArray<ExampleResult>,
  // The OTHER documents this run's steps came from — the oaths a reference
  // block pulled steps in from (ADR 0016), as `path → source`. Their hashes go
  // in the payload so a consumer can tell a stale failure from a live one, the
  // same way `sourceHash` does for the oath itself. Empty in a project that
  // uses no reference blocks.
  referencedSources: ReadonlyMap<string, string> = new Map(),
): OathResults {
  const documents = [...referencedSources]
    .map(([path, referencedSource]) => ({ path, sourceHash: hashSource(referencedSource) }))
    .sort((a, b) => a.path.localeCompare(b.path))
  return {
    version: 2,
    oathPath,
    sourceHash: hashSource(source),
    ...(documents.length > 0 ? { documents } : {}),
    examples: documentOrder(examples),
  }
}

/**
 * Writes one oath's results: 2-space indent plus a trailing newline. Passing
 * oaths are written too — a stale file would keep a diagnostic on screen that
 * the run has just cleared.
 */
export function writeOathResults(cwd: string, results: OathResults): string {
  const out = resultFilePath(results.oathPath, cwd)
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, `${JSON.stringify(results, null, 2)}\n`)
  return out
}
