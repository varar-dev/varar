import { readFileSync } from 'node:fs'
import { relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { findFiles, loadConfig } from '@varar/config'
import type { StepRegistration } from '@varar/core'
import { loadSteps, planOath } from '@varar/runner'

export type LintOptions = {
  readonly cwd: string
  readonly json: boolean
  readonly globs: ReadonlyArray<string> | undefined
  readonly writeStdout: (s: string) => void
  readonly writeStderr: (s: string) => void
}

export type LintResult = { readonly exitCode: number }

type Item = {
  readonly path: string
  readonly severity: 'error' | 'warning'
  readonly code: string
  readonly line: number
  readonly col: number
  readonly message: string
}

/**
 * Check the oaths against the step definitions they bind to.
 *
 * Lint plans every discovered oath with the SAME registry `varar run` uses — it
 * loads the step files first. It used to plan against an empty registry, which
 * meant it could not see an ambiguous match (that needs two definitions) and
 * flagged every `error` fence as orphaned even when a step matched perfectly.
 *
 * What lint deliberately does NOT report is a sentence that matches nothing.
 * That is prose, by design — the whole point of a Varar oath is that most of the
 * document is documentation. A sentence that USED to be an example is caught by
 * drift detection against varar.lock.json (`varar run`), not here.
 */
export async function runLint(opts: LintOptions): Promise<LintResult> {
  const cfg = await loadConfig(opts.cwd)
  // A CLI `--globs` override is include-only; excludes live in varar.config.json.
  const cliGlobs = opts.globs ?? []
  const narrowed = cliGlobs.length > 0
  const globs = narrowed ? { include: cliGlobs, exclude: [] } : cfg.docs
  const files = findFiles(opts.cwd, globs.include, globs.exclude)
  const { registry } = await loadSteps(cfg.steps, opts.cwd)

  const items: Item[] = []
  const matched = new Set<StepRegistration>()
  for (const path of files) {
    const source = readFileSync(path, 'utf8')
    const execution = planOath(path, source, registry)
    for (const d of execution.diagnostics) {
      items.push({
        path: rel(opts.cwd, path),
        severity: d.severity,
        code: d.code,
        line: d.span.startLine,
        col: d.span.startCol,
        message: d.message,
      })
    }
    for (const example of execution.examples) {
      for (const step of example.steps) matched.add(step.stepDef)
      if (example.headerBinding) matched.add(example.headerBinding.stepDef)
    }
  }

  // A step definition no oath uses is dead code — the other half of a rename,
  // where drift detection catches the paragraph and this catches the orphan.
  //
  // Two conditions, because "unused" is only meaningful when the whole corpus
  // planned cleanly. With a CLI glob narrowing the oaths, every step the
  // excluded documents use would look orphaned; and an ambiguous sentence
  // leaves ALL its candidates unmatched, so a single ambiguity would report
  // every one of them as dead. Fix the errors, then ask about orphans.
  const clean = !items.some((i) => i.severity === 'error')
  if (!narrowed && clean) {
    for (const step of registry.steps) {
      if (matched.has(step)) continue
      items.push({
        path: rel(opts.cwd, step.expressionSourceFile),
        severity: 'warning',
        code: 'orphan-step',
        line: step.expressionSourceLine,
        col: 1,
        message: `No sentence in any oath matches this step: "${step.expression}".`,
      })
    }
  }

  if (opts.json) {
    opts.writeStdout(`${JSON.stringify({ diagnostics: items }, null, 2)}\n`)
  } else {
    for (const it of items) {
      opts.writeStdout(
        `${it.path}:${it.line}:${it.col}  ${it.severity}  ${it.code}  ${firstLine(it.message)}\n`,
      )
    }
  }
  return { exitCode: items.some((i) => i.severity === 'error') ? 1 : 0 }
}

// Step registrations record where the expression was written as a file URL (the
// builder reads it off a stack trace); oath paths arrive as plain paths. Both
// print relative to the working directory.
function rel(cwd: string, path: string): string {
  const local = path.startsWith('file:') ? fileURLToPath(path) : path
  return relative(cwd, local) || local
}

function firstLine(s: string): string {
  const i = s.indexOf('\n')
  return i === -1 ? s : s.slice(0, i)
}
