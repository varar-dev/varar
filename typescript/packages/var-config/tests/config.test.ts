import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { loadVarConfig, parseVarConfig } from '../src/config.ts'
import { findFiles } from '../src/find-files.ts'

test('parseVarConfig reads all four keys', () => {
  const parsed = parseVarConfig(
    `{
      "docs": { "include": ["specs/**/*.md"], "exclude": ["specs/wip/**"] },
      "steps": ["**/*.steps.ts"],
      "snippets": { "typescript": "T" },
      "scannerPlugins": ["gherkinTables"]
    }`,
    'var.config.json',
  )
  expect(parsed).toEqual({
    docs: { include: ['specs/**/*.md'], exclude: ['specs/wip/**'] },
    steps: ['**/*.steps.ts'],
    snippets: { typescript: 'T' },
    scannerPlugins: ['gherkinTables'],
  })
})

test('all keys are optional and default to empty; $schema is ignored', () => {
  const parsed = parseVarConfig('{ "$schema": "https://x/y.json" }', 'var.config.json')
  expect(parsed).toEqual({
    docs: { include: [], exclude: [] },
    steps: [],
    snippets: {},
    scannerPlugins: [],
  })
})

test('null values are treated as absent, not errors', () => {
  const parsed = parseVarConfig(
    '{ "docs": { "include": null, "exclude": null }, "steps": null, "snippets": null, "scannerPlugins": null }',
    'var.config.json',
  )
  expect(parsed).toEqual({
    docs: { include: [], exclude: [] },
    steps: [],
    snippets: {},
    scannerPlugins: [],
  })
})

test('malformed JSON throws with the source path in the message', () => {
  expect(() => parseVarConfig('{ nope', '/w/var.config.json')).toThrowError(
    /^\/w\/var\.config\.json/,
  )
})

test('an unknown top-level key throws (migration tripwire for the old "vars" key)', () => {
  expect(() => parseVarConfig('{ "vars": {} }', 'var.config.json')).toThrowError(
    /unknown key.*"vars"/i,
  )
})

test('a wrong-typed value throws naming the key', () => {
  expect(() => parseVarConfig('{ "steps": "x" }', 'var.config.json')).toThrowError(/steps/)
  expect(() => parseVarConfig('{ "docs": [] }', 'var.config.json')).toThrowError(/docs/)
  expect(() =>
    parseVarConfig('{ "snippets": { "typescript": 1 } }', 'var.config.json'),
  ).toThrowError(/snippets/)
})

test('loadVarConfig resolves plugin names and keeps the names', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'var-cfg-'))
  try {
    writeFileSync(
      join(dir, 'var.config.json'),
      '{ "docs": { "include": ["**/*.md"] }, "scannerPlugins": ["gherkinTables"] }\n',
    )
    const cfg = await loadVarConfig(dir)
    expect(cfg.docs).toEqual({ include: ['**/*.md'], exclude: [] })
    expect(cfg.steps).toEqual([])
    expect(cfg.scannerPluginNames).toEqual(['gherkinTables'])
    expect(cfg.scannerPlugins.map((p) => p.name)).toEqual(['gherkin/tables'])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('missing var.config.json yields the empty config (no default steps glob)', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'var-cfg-none-'))
  try {
    const cfg = await loadVarConfig(dir)
    expect(cfg.docs).toEqual({ include: [], exclude: [] })
    expect(cfg.steps).toEqual([])
    expect(cfg.snippets).toEqual({})
    expect(cfg.scannerPlugins).toEqual([])
    expect(cfg.scannerPluginNames).toEqual([])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('loadVarConfig rejects an unknown plugin name', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'var-cfg-badplugin-'))
  try {
    writeFileSync(join(dir, 'var.config.json'), '{ "scannerPlugins": ["nope"] }\n')
    await expect(loadVarConfig(dir)).rejects.toThrowError(/unknown scanner plugin "nope"/i)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('findFiles resolves include globs to absolute paths', () => {
  const dir = mkdtempSync(join(tmpdir(), 'var-config-find-'))
  try {
    writeFileSync(join(dir, 'a.md'), '# Spec A\n')
    writeFileSync(join(dir, 'b.md'), '# Spec B\n')
    const files = findFiles(dir, ['*.md'])
    expect(files).toHaveLength(2)
    expect(files.every((f) => f.startsWith(dir))).toBe(true)
    expect(files.map((f) => f.split('/').at(-1)).sort()).toEqual(['a.md', 'b.md'])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('findFiles respects exclude globs', () => {
  const dir = mkdtempSync(join(tmpdir(), 'var-config-find-excl-'))
  try {
    writeFileSync(join(dir, 'a.md'), '# Spec A\n')
    writeFileSync(join(dir, 'wip.md'), '# WIP\n')
    const files = findFiles(dir, ['*.md'], ['wip.md'])
    expect(files).toHaveLength(1)
    expect(files[0]).toMatch(/a\.md$/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
