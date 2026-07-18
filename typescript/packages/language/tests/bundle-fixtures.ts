import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const BUNDLES_DIR = fileURLToPath(new URL('../../../../conformance/bundles', import.meta.url))

// The step-definition fixture for a language in a conformance bundle, located
// by its file extension (e.g. '.rb' → 'numerals.steps.rb', '.java' →
// 'NumeralsSteps.java'). These fixtures are compiled and executed by each
// port's own conformance harness, so they are known-good sources — unlike
// hand-written inline strings, which drift silently when the author DSL
// changes. Scanner tests read them so a DSL change surfaces in one place.
export function bundleFixture(bundle: string, ext: string): { name: string; source: string } {
  const dir = `${BUNDLES_DIR}/${bundle}`
  const matches = readdirSync(dir).filter((f) => f.endsWith(ext))
  if (matches.length !== 1) {
    throw new Error(
      `bundle ${bundle}: expected exactly one "${ext}" fixture, found ${matches.length}`,
    )
  }
  const name = matches[0]!
  return { name, source: readFileSync(`${dir}/${name}`, 'utf8') }
}
