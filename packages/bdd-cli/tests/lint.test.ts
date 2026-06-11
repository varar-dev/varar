import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { runLint } from '../src/lint.js'

test('exit code 0 when no diagnostics found', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'bdd-lint-clean-'))
  try {
    writeFileSync(
      join(dir, 'docs.bdd.md'),
      '# Just docs\n\nSome prose with no keyword-led sentences.',
    )
    const result = await runLint({
      cwd: dir,
      json: true,
      globs: undefined,
      writeStdout: () => {},
      writeStderr: () => {},
    })
    expect(result.exitCode).toBe(0)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('human-readable output (no --json) lists path:line for an orphan-attachment', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'bdd-lint-text-'))
  try {
    writeFileSync(join(dir, 'a.bdd.md'), '# A\n\n```js\nx=1\n```\n')
    const captured: string[] = []
    await runLint({
      cwd: dir,
      json: false,
      globs: undefined,
      writeStdout: (s) => captured.push(s),
      writeStderr: () => {},
    })
    const out = captured.join('')
    expect(out).toContain('a.bdd.md')
    expect(out).toContain('orphan-attachment')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
