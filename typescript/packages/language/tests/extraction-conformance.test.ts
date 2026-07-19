import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'
import languages from '../../../../languages.json' with { type: 'json' }
import { createTreeSitterScanner, languageIdForPath } from '../src/tree-sitter-scanner.ts'
import { createTestGrammarLoader } from './test-grammar-loader.ts'

// ADR 0001's "per-language fixtures, shared expectations" applied to the
// extraction seam: for every conformance bundle, each language's steps
// fixture must yield the IDENTICAL (kind, expression) set — and, where
// present, the identical parameter-type (name, regexp) set. Every port must
// agree, so we pick one arbitrarily as the comparison baseline; the choice
// of language carries no significance.
//
// The language set is derived from the single source of truth (languages.json),
// not hand-listed here, so a new port is covered automatically. A file in a
// bundle is a given language's step fixture iff its name ends in that
// language's step-file extension (`.rb`, `.java`, …). Because the `not empty`
// assertion below runs per language per bundle, this doubles as the drift gate:
// a bundle that lacks a fixture for any supported language fails.
const BUNDLES_DIR = fileURLToPath(new URL('../../../../conformance/bundles', import.meta.url))
const BASELINE = 'ts' // arbitrary languages.json id used as the comparison anchor

const LANGUAGES = languages.map((lang) => {
  const languageId = languageIdForPath(`fixture${lang.ext}`)
  if (!languageId) {
    throw new Error(
      `languages.json: ${lang.label} extension "${lang.ext}" has no tree-sitter dialect`,
    )
  }
  return { id: lang.id, label: lang.label, ext: lang.ext, languageId }
})

const bundles = readdirSync(BUNDLES_DIR, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name)
  .sort()

describe('extraction conformance across languages', () => {
  for (const bundle of bundles) {
    test(bundle, async () => {
      const scanner = await createTreeSitterScanner(
        createTestGrammarLoader(),
        LANGUAGES.map((l) => l.languageId),
      )
      const dir = join(BUNDLES_DIR, bundle)
      const files = readdirSync(dir)
      const byLanguage = new Map<string, { steps: string[]; types: string[] }>()
      for (const lang of LANGUAGES) {
        const fixtures = files.filter((f) => f.endsWith(lang.ext)).sort()
        expect(fixtures, `${bundle}: missing ${lang.label} fixture`).not.toHaveLength(0)
        const steps: string[] = []
        const types: string[] = []
        for (const fixture of fixtures) {
          const source = readFileSync(join(dir, fixture), 'utf8')
          for (const d of scanner.discoverStepDefs(fixture, source)) {
            steps.push(`${d.kind}|${d.expression}`)
          }
          for (const t of scanner.discoverParameterTypes(fixture, source)) {
            types.push(`${t.name}|${t.regexp}`)
          }
        }
        byLanguage.set(lang.id, { steps: steps.sort(), types: types.sort() })
      }
      const baseline = byLanguage.get(BASELINE)
      for (const [id, actual] of byLanguage) {
        expect(actual.steps, `${bundle}: ${id} step set differs from ${BASELINE}`).toEqual(
          baseline?.steps,
        )
        expect(actual.types, `${bundle}: ${id} param-type set differs from ${BASELINE}`).toEqual(
          baseline?.types,
        )
      }
      // The corpus itself must be non-trivial: every bundle defines steps,
      // and bundle 13 defines the {airport} parameter type.
      expect(baseline?.steps.length).toBeGreaterThan(0)
      if (bundle === '13-custom-parameter-type') {
        expect(baseline?.types).toEqual(['airport|[A-Z]{3}'])
      }
    })
  }
})
