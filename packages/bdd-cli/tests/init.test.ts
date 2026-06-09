import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { runInit } from '../src/init.js'

test('scaffolds bdd.config.ts and an example .bdd.md + steps file', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'bdd-init-'))
  try {
    const result = await runInit({ cwd: dir, writeStdout: () => {} })
    expect(result.exitCode).toBe(0)
    expect(existsSync(join(dir, 'bdd.config.ts'))).toBe(true)
    expect(existsSync(join(dir, 'bdd-examples/01-hello.bdd.md'))).toBe(true)
    expect(existsSync(join(dir, 'bdd-examples/steps/01-hello.steps.ts'))).toBe(true)
    const stepsTs = readFileSync(join(dir, 'bdd-examples/steps/01-hello.steps.ts'), 'utf8')
    expect(stepsTs).toContain('defineContext')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('refuses to overwrite an existing bdd.config.ts; reports which files were skipped', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'bdd-init-conflict-'))
  try {
    writeFileSync(join(dir, 'bdd.config.ts'), '/* mine */')
    const captured: string[] = []
    const result = await runInit({ cwd: dir, writeStdout: (s) => captured.push(s) })
    expect(result.exitCode).toBe(0)
    expect(readFileSync(join(dir, 'bdd.config.ts'), 'utf8')).toBe('/* mine */')
    expect(captured.join('')).toContain('skipped')
    expect(captured.join('')).toContain('bdd.config.ts')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
