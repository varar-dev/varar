import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { buildHandlers } from '../src/handlers.js'
import { createStore } from '../src/store.js'

function tempWorkspace(setup: (dir: string) => void): { dir: string; cleanup: () => void } {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'bdd-lsp-')))
  setup(dir)
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) }
}

test('hoverOnMd returns the matching step def expression and source location', async () => {
  const { dir, cleanup } = tempWorkspace((dir) => {
    writeFileSync(join(dir, 'bdd.config.ts'), 'export default {}\n')
    writeFileSync(
      join(dir, 'a.steps.ts'),
      `step('I have {int} cukes', () => {})
`,
    )
    writeFileSync(join(dir, 'b.bdd.md'), '# B\n\nGiven I have 5 cukes')
  })
  try {
    const store = createStore()
    await store.reindex(dir)
    const h = buildHandlers(store)
    // Cursor on line 3, character 12 (somewhere inside "I have 5 cukes")
    const result = h.hover({
      uri: `file://${join(dir, 'b.bdd.md')}`,
      position: { line: 3, character: 12 },
    })
    expect(result?.contents).toMatch(/I have \{int\} cukes/)
    expect(result?.contents).toContain('a.steps.ts')
  } finally {
    cleanup()
  }
})

test('definitionFromMd returns the steps.ts location for a matched step', async () => {
  const { dir, cleanup } = tempWorkspace((dir) => {
    writeFileSync(join(dir, 'bdd.config.ts'), 'export default {}\n')
    writeFileSync(
      join(dir, 'a.steps.ts'),
      `step('I have {int} cukes', () => {})
`,
    )
    writeFileSync(join(dir, 'b.bdd.md'), '# B\n\nGiven I have 5 cukes')
  })
  try {
    const store = createStore()
    await store.reindex(dir)
    const h = buildHandlers(store)
    const result = h.definition({
      uri: `file://${join(dir, 'b.bdd.md')}`,
      position: { line: 3, character: 12 },
    })
    expect(result?.uri).toBe(`file://${join(dir, 'a.steps.ts')}`)
    expect(result?.range.start.line).toBe(0) // LSP uses 0-based lines
  } finally {
    cleanup()
  }
})

test('diagnosticsFor returns missing-step diagnostics for unmatched keyword-led sentences', async () => {
  const { dir, cleanup } = tempWorkspace((dir) => {
    writeFileSync(join(dir, 'bdd.config.ts'), 'export default {}\n')
    writeFileSync(join(dir, 'b.bdd.md'), '# B\n\nGiven I have 5 cukes')
  })
  try {
    const store = createStore()
    await store.reindex(dir)
    const h = buildHandlers(store)
    const diags = h.diagnosticsFor(`file://${join(dir, 'b.bdd.md')}`)
    expect(diags).toHaveLength(1)
    expect(diags[0]?.code).toBe('missing-step')
  } finally {
    cleanup()
  }
})
