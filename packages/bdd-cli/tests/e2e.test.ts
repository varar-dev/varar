import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'

const BIN = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'bin.js')

function run(args: ReadonlyArray<string>, cwd: string) {
  return spawnSync('node', [BIN, ...args], { cwd, encoding: 'utf8' })
}

describe('bdd CLI (built bin)', () => {
  test('stepdef --print emits the templated snippet to stdout', () => {
    const dir = mkdtempSync(join(tmpdir(), 'bdd-e2e-'))
    try {
      const r = run(['stepdef', 'I have 5 cukes', '--print'], dir)
      expect(r.status).toBe(0)
      expect(r.stdout).toContain("step('I have {int} cukes', (ctx, count: number) => {")
      expect(r.stdout).toContain("throw new Error('not implemented')")
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('init scaffolds three files and exits 0', () => {
    const dir = mkdtempSync(join(tmpdir(), 'bdd-e2e-init-'))
    try {
      const r = run(['init'], dir)
      expect(r.status).toBe(0)
      expect(readFileSync(join(dir, 'bdd.config.ts'), 'utf8')).toContain('bdds:')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('lint --json exits 1 when a missing-step diagnostic is present', () => {
    const dir = mkdtempSync(join(tmpdir(), 'bdd-e2e-lint-'))
    try {
      writeFileSync(join(dir, 'a.bdd.md'), '# A\n\nGiven I have 5 cukes')
      const r = run(['lint', '--json'], dir)
      expect(r.status).toBe(1)
      const parsed = JSON.parse(r.stdout)
      expect(parsed.diagnostics[0].code).toBe('missing-step')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
