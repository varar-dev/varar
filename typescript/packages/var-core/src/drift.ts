import type { VarDoc } from './ast.ts'
import { hashSource } from './hash.ts'
import { deriveExampleName, type ExecutionPlan } from './plan.ts'
import type { Span } from './span.ts'

// One example-producing paragraph, as recorded in the committed baseline.
// `name` is the paragraph's normalized primary text (identical to the planned
// example's name); `line` is the 1-based start line of its primary block. Both
// are match keys for drift: `name` catches a step rename (Markdown unchanged),
// `line` catches an in-place typo (text changed at the same line).
export type BaselineExample = {
  readonly name: string
  readonly line: number
}

// The committed baseline for one spec file.
export type SpecBaseline = {
  readonly sourceHash: string
  readonly examples: ReadonlyArray<BaselineExample>
}

// The whole `var.lock.json`: every spec keyed by its POSIX path relative to the
// project root.
export type VarLock = {
  readonly version: 1
  readonly specs: Readonly<Record<string, SpecBaseline>>
}

// A paragraph that the baseline says was an example and now matches zero steps.
export type Drift = {
  readonly name: string
  readonly line: number
}

// Is `inner` positioned within `outer` (offset containment)? A planned
// example's span sits inside its structural candidate's span — exactly for the
// 1:1 case, strictly inside for header-bound rows nested in the binding
// paragraph.
function within(inner: Span, outer: Span): boolean {
  return inner.startOffset >= outer.startOffset && inner.endOffset <= outer.endOffset
}

// A candidate paragraph is "live" (still an example) if at least one planned
// example falls within it.
function isLive(candidateSpan: Span, plan: ExecutionPlan): boolean {
  return plan.examples.some((pe) => within(pe.span, candidateSpan))
}

// The current example-producing paragraphs, in document order — what a clean
// run records as the new baseline for a spec.
export function liveExamples(varDoc: VarDoc, plan: ExecutionPlan): ReadonlyArray<BaselineExample> {
  const out: BaselineExample[] = []
  for (const candidate of varDoc.examples) {
    if (isLive(candidate.span, plan)) {
      out.push({ name: deriveExampleName(candidate.body), line: candidate.span.startLine })
    }
  }
  return out
}

// The full baseline record for a spec: its source fingerprint plus its live
// examples.
export function deriveSpecBaseline(
  source: string,
  varDoc: VarDoc,
  plan: ExecutionPlan,
): SpecBaseline {
  return { sourceHash: hashSource(source), examples: liveExamples(varDoc, plan) }
}

// Detect drift for one spec: paragraphs the baseline recorded as examples that
// now match zero steps. Pure — no `sourceHash` short-circuit, because a step
// definition can be renamed with the Markdown (and its hash) untouched.
export function detectDrift(
  baseline: SpecBaseline | undefined,
  varDoc: VarDoc,
  plan: ExecutionPlan,
): ReadonlyArray<Drift> {
  if (!baseline) return [] // no baseline yet (first run) — nothing to compare
  const candidates = varDoc.examples
  const names = candidates.map((c) => deriveExampleName(c.body))
  const live = candidates.map((c) => isLive(c.span, plan))

  const drifts: Drift[] = []
  for (const b of baseline.examples) {
    // Match by name first (step-rename case), then by line (in-place typo case).
    let idx = names.indexOf(b.name)
    if (idx < 0) idx = candidates.findIndex((c) => c.span.startLine === b.line)
    if (idx < 0) continue // paragraph deleted / moved — a deliberate removal, not drift
    if (live[idx]) continue // still an example — not drift
    drifts.push({ name: b.name, line: candidates[idx]?.span.startLine ?? b.line })
  }
  return drifts
}

function isBaselineExample(v: unknown): v is BaselineExample {
  if (typeof v !== 'object' || v === null) return false
  const e = v as Record<string, unknown>
  return typeof e.name === 'string' && typeof e.line === 'number'
}

function isSpecBaseline(v: unknown): v is SpecBaseline {
  if (typeof v !== 'object' || v === null) return false
  const b = v as Record<string, unknown>
  return (
    typeof b.sourceHash === 'string' &&
    Array.isArray(b.examples) &&
    b.examples.every(isBaselineExample)
  )
}

// Parse `var.lock.json`. Returns null on malformed input (treated as "no
// baseline yet"), mirroring the LSP's tolerant result ingestion.
export function parseVarLock(text: string): VarLock | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null) return null
  const obj = parsed as Record<string, unknown>
  if (obj.version !== 1 || typeof obj.specs !== 'object' || obj.specs === null) return null
  const specs: Record<string, SpecBaseline> = {}
  for (const [path, value] of Object.entries(obj.specs as Record<string, unknown>)) {
    if (!isSpecBaseline(value)) return null
    specs[path] = value
  }
  return { version: 1, specs }
}

// Serialize a `var.lock.json` deterministically: spec paths sorted, examples in
// document order, two-space indent, trailing newline. Byte-stable across runs
// so a clean re-run produces no git diff.
export function stringifyVarLock(lock: VarLock): string {
  const specs: Record<string, SpecBaseline> = {}
  for (const path of Object.keys(lock.specs).sort()) {
    const b = lock.specs[path]
    if (b) specs[path] = b
  }
  return `${JSON.stringify({ version: 1, specs }, null, 2)}\n`
}
