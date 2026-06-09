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

function cloneRegexpWithGlobal(re: RegExp): RegExp {
  const flags = re.flags.includes('g') ? re.flags : `${re.flags}g`
  // The cucumber-expressions library produces anchored regexes (^...$).
  // For substring scanning, strip the anchors before recompiling.
  let source = re.source
  if (source.startsWith('^')) source = source.slice(1)
  if (source.endsWith('$')) source = source.slice(0, -1)
  return new RegExp(source, flags)
}
