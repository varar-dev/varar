import type { Group } from '@cucumber/cucumber-expressions'
import type { ParameterFormat, Registry, StepRegistration } from './registry.ts'

export type ParamSpan = { readonly start: number; readonly end: number }

export type Hit = {
  readonly expression: string
  readonly stepDef: StepRegistration
  readonly matchStart: number
  readonly matchEnd: number
  readonly args: ReadonlyArray<unknown>
  // The whole matched notation for each parameter, including any surrounding
  // delimiters — e.g. `"hi there"` (with quotes) for {string}. Sliced back
  // verbatim by rename; used for the "actual" side of a mismatch. Aligned 1:1
  // with `paramInnerSpans`.
  readonly paramSpans: ReadonlyArray<ParamSpan>
  // The value passed to the step handler: the outermost inner capture group of
  // the parameter's regexp — e.g. `hi there` (no quotes) for {string}. This is
  // what editors highlight. Falls back to the whole notation (equals the
  // matching `paramSpans` entry) for parameter regexps with no capture group
  // ({int}, {word}, delimiter-stripping custom types). Aligned 1:1 with
  // `paramSpans`.
  readonly paramInnerSpans: ReadonlyArray<ParamSpan>
  // Each captured argument's parameter-type display formatter (or undefined),
  // aligned 1:1 with `args`. Resolved here because only the matcher sees which
  // parameter type produced each argument.
  readonly formats: ReadonlyArray<ParameterFormat | undefined>
}

// The outermost inner capture group of a parameter's regexp — the value passed
// to the handler. `arg.group` is the parameter's outer wrapping group; its
// `children` are its regexp's own capture groups (one level down, or undefined
// when there are none). For {string}'s alternation exactly one branch's group
// has a numeric span. Returns undefined when the parameter regexp has no
// capture group ({int}, {word}, delimiter-stripping custom types), so the
// caller keeps the whole-notation span.
function innerSpan(group: Group): { start: number; end: number } | undefined {
  for (const child of group.children ?? []) {
    if (typeof child.start === 'number' && typeof child.end === 'number') {
      return { start: child.start, end: child.end }
    }
  }
  return undefined
}

export function findHits(sentence: string, registry: Registry): ReadonlyArray<Hit> {
  const hits: Hit[] = []
  for (const step of registry.steps) {
    const regexp = step.compiled.regexp
    const re = cloneRegexpWithGlobal(regexp)
    for (let m = re.exec(sentence); m !== null; m = re.exec(sentence)) {
      const matched = step.compiled.match(m[0])
      const args = matched?.map((a) => a.getValue(undefined)) ?? []
      const formats = matched?.map((a) => registry.formats.get(a.parameterType.name ?? '')) ?? []
      // Each Argument.group carries the parameter's start/end within m[0];
      // shift by m.index so spans are sentence-relative like matchStart. Build
      // both span arrays in the same loop so they stay aligned 1:1.
      const paramSpans: ParamSpan[] = []
      const paramInnerSpans: ParamSpan[] = []
      for (const arg of matched ?? []) {
        const { start, end } = arg.group
        if (typeof start === 'number' && typeof end === 'number') {
          paramSpans.push({ start: m.index + start, end: m.index + end })
          const inner = innerSpan(arg.group)
          paramInnerSpans.push(
            inner
              ? { start: m.index + inner.start, end: m.index + inner.end }
              : { start: m.index + start, end: m.index + end },
          )
        }
      }
      hits.push({
        expression: step.expression,
        stepDef: step,
        matchStart: m.index,
        matchEnd: m.index + m[0].length,
        args,
        paramSpans,
        paramInnerSpans,
        formats,
      })
      if (m[0].length === 0) re.lastIndex++
    }
  }
  return hits
}

export type ResolvedSteps =
  | { readonly kind: 'ok'; readonly steps: ReadonlyArray<Hit> }
  | { readonly kind: 'ambiguous'; readonly collisions: ReadonlyArray<AmbiguityCollision> }

export type AmbiguityCollision = {
  readonly matchStart: number
  readonly matchEnd: number
  readonly candidates: ReadonlyArray<Hit>
}

export function resolveHits(hits: ReadonlyArray<Hit>): ResolvedSteps {
  if (hits.length === 0) return { kind: 'ok', steps: [] }
  const sorted = [...hits].sort((a, b) => {
    if (a.matchStart !== b.matchStart) return a.matchStart - b.matchStart
    return b.matchEnd - b.matchStart - (a.matchEnd - a.matchStart)
  })

  const collisions: AmbiguityCollision[] = []
  for (let i = 0; i < sorted.length; i++) {
    const here = sorted[i]
    if (!here) continue
    const tied: Hit[] = [here]
    let j = i + 1
    while (j < sorted.length) {
      const candidate = sorted[j]
      if (!candidate) break
      if (
        candidate.matchStart === here.matchStart &&
        candidate.matchEnd - candidate.matchStart === here.matchEnd - here.matchStart
      ) {
        tied.push(candidate)
        j++
      } else {
        break
      }
    }
    if (tied.length > 1) {
      collisions.push({ matchStart: here.matchStart, matchEnd: here.matchEnd, candidates: tied })
    }
    i = j - 1
  }
  if (collisions.length > 0) return { kind: 'ambiguous', collisions }

  const steps: Hit[] = []
  let cursor = -1
  for (const hit of sorted) {
    if (hit.matchStart < cursor) continue
    steps.push(hit)
    cursor = hit.matchEnd
  }
  return { kind: 'ok', steps }
}

function cloneRegexpWithGlobal(re: RegExp): RegExp {
  const flags = re.flags.includes('g') ? re.flags : `${re.flags}g`
  // The cucumber-expressions library produces anchored regexes (^...$).
  // For substring scanning, strip the anchors before recompiling.
  let source = re.source
  if (source.startsWith('^')) source = source.slice(1)
  if (source.endsWith('$')) source = source.slice(0, -1)
  return new RegExp(source, flags)
}
