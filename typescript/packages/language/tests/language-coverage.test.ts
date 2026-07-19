import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'
import languages from '../../../../languages.json' with { type: 'json' }
import { createTreeSitterScanner, languageIdForPath } from '../src/tree-sitter-scanner.ts'
import { createTestGrammarLoader } from './test-grammar-loader.ts'

// A cross-axis drift gate: adding a language port means wiring it into several
// places, and it is easy to forget one (Ruby shipped without a tree-sitter
// dialect and without doc tabs). These tests assert that every language in the
// single source of truth — languages.json — is present in the axes most prone
// to being forgotten: the tree-sitter authoring scanner and the docs code tabs.
// The build/release axes (Makefile, CI, release scopes, example projects) use a
// different granularity and are covered by make check per port.

const DOCS_DIR = fileURLToPath(new URL('../../website/src/content/docs', import.meta.url))

function readAllDocs(): ReadonlyArray<readonly [string, string]> {
  const out: [string, string][] = []
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = `${dir}/${entry.name}`
      if (entry.isDirectory()) walk(path)
      else if (entry.name.endsWith('.md') || entry.name.endsWith('.mdx')) {
        out.push([path, readFileSync(path, 'utf8')])
      }
    }
  }
  walk(DOCS_DIR)
  return out
}

// The `.wasm` grammar basenames a file references (excluding web-tree-sitter's
// own runtime wasm).
function grammarWasms(path: string): ReadonlySet<string> {
  const text = readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8')
  return new Set(
    [...text.matchAll(/([\w-]+)\.wasm/g)]
      .map((m) => m[1])
      .filter((name): name is string => name !== undefined && name !== 'web-tree-sitter'),
  )
}

describe('language coverage (drift gate)', () => {
  test('every languages.json language has a tree-sitter dialect', async () => {
    for (const lang of languages) {
      const id = languageIdForPath(`example${lang.ext}`)
      expect(
        id,
        `no tree-sitter LanguageId maps the ${lang.label} extension "${lang.ext}"`,
      ).toBeDefined()
      // Building the scanner loads the dialect and its grammar wasm; it throws
      // if either the dialect (SPECS) or the test grammar loader is missing.
      await expect(
        createTreeSitterScanner(createTestGrammarLoader(), [id!]),
        `no tree-sitter dialect wired for ${lang.label}`,
      ).resolves.toBeDefined()
    }
  })

  test('the grammar loaders and the VS Code bundler list the same grammars', () => {
    const nodeLoader = grammarWasms('../../lsp/src/node-grammar-loader.ts')
    const testLoader = grammarWasms('./test-grammar-loader.ts')
    const vscodeBundler = grammarWasms('../../vscode/esbuild.mjs')
    expect(testLoader).toEqual(nodeLoader)
    expect(vscodeBundler).toEqual(nodeLoader)
  })

  test('every <Tabs syncKey="lang"> group lists every language', () => {
    const labels = languages.map((l) => l.label)
    const failures: string[] = []
    for (const [path, source] of readAllDocs()) {
      // Each language-synced tab group must offer all languages, so a new port
      // (or a new group) can never silently omit one.
      const groups = source.split('<Tabs syncKey="lang">').slice(1)
      for (const group of groups) {
        const body = group.split('</Tabs>')[0] ?? ''
        for (const label of labels) {
          if (!body.includes(`label="${label}"`)) {
            failures.push(
              `${path.replace(DOCS_DIR, 'docs')}: a lang tab group is missing "${label}"`,
            )
          }
        }
      }
    }
    expect(failures, failures.join('\n')).toEqual([])
  })
})
