import type { Registry, StepRegistration } from './registry.js'

export type Hit = {
  readonly expression: string
  readonly stepDef: StepRegistration
  readonly matchStart: number
  readonly matchEnd: number
  readonly args: ReadonlyArray<unknown>
}

export function findHits(sentence: string, registry: Registry): ReadonlyArray<Hit> {
  const hits: Hit[] = []
  for (const step of registry.steps) {
    const regexp = step.compiled.regexp
    const re = cloneRegexpWithGlobal(regexp)
    for (let m = re.exec(sentence); m !== null; m = re.exec(sentence)) {
      const args = step.compiled.match(m[0])?.map((a) => a.getValue(undefined)) ?? []
      hits.push({
        expression: step.expression,
        stepDef: step,
        matchStart: m.index,
        matchEnd: m.index + m[0].length,
        args,
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
