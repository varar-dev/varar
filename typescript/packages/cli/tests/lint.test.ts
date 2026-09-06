import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'
import { runLint } from '../src/lint.ts'

const HERE = dirname(fileURLToPath(import.meta.url))
const BIN_TS = resolve(HERE, '..', 'src', 'bin.ts')
const FIXTURES = resolve(HERE, 'fixtures')

test('exit code 0 when no diagnostics found', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'varar-lint-clean-'))
  try {
    writeFileSync(join(dir, 'docs.md'), '# Just docs\n\nSome prose with no keyword-led sentences.')
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
test('a standalone table or fenced code block is not a lint error', async () => {
  // Tables and fenced code blocks that do not attach to a step are valid
  // Markdown content, not mistakes — `varar lint` stays quiet about them.
  const dir = mkdtempSync(join(tmpdir(), 'varar-lint-text-'))
  try {
    writeFileSync(join(dir, 'a.md'), '# A\n\n```js\nx=1\n```\n\n| a | b |\n|---|---|\n| 1 | 2 |\n')
    const captured: string[] = []
    const result = await runLint({
      cwd: dir,
      json: false,
      globs: undefined,
      writeStdout: (s) => captured.push(s),
      writeStderr: () => {},
    })
    expect(captured.join('')).toBe('')
    expect(result.exitCode).toBe(0)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

// The lint checks that need real step definitions. Spawned rather than called
// in-process: loadSteps imports the step files, and Node's module cache would
// hand a second in-process load of the same fixture an already-registered
// module with nothing left to register.
describe('varar lint (against loaded step definitions)', () => {
  function lint(fixture: string) {
    const cwd = resolve(FIXTURES, fixture)
    const r = spawnSync(process.execPath, [BIN_TS, 'lint'], { cwd, encoding: 'utf8' })
    return { stdout: r.stdout, status: r.status }
  }

  test('an `error` fence whose step exists is not a diagnostic', () => {
    // Lint used to plan against an empty registry, so every error fence looked
    // orphaned — a false positive on a correct project (#63).
    const r = lint('lint-error-fence')
    expect(r.stdout).toBe('')
    expect(r.status).toBe(0)
  })

  test('an `error` fence with no step to run is an error, and exits 1', () => {
    const r = lint('lint-fence-no-step')
    expect(r.stdout).toMatch(/division\.md:5:1 {2}error {2}error-fence-without-step/)
    expect(r.status).toBe(1)
  })

  test('two definitions matching one sentence are an ambiguous-match error', () => {
    // Needs both definitions loaded; unreachable while the registry was empty,
    // which made lint's only failing exit code dead.
    const r = lint('lint-ambiguous')
    expect(r.stdout).toMatch(/division\.md:3:1 {2}error {2}ambiguous-match/)
    expect(r.status).toBe(1)
  })

  test('ambiguity does not also report its candidates as orphans', () => {
    const r = lint('lint-ambiguous')
    expect(r.stdout).not.toContain('orphan-step')
  })

  test('a step no oath matches is an orphan warning, and still exits 0', () => {
    const r = lint('lint-orphan')
    expect(r.stdout).toMatch(
      /greeting\.steps\.ts:8:1 {2}warning {2}orphan-step {2}No sentence in any oath matches this step: "I wave at \{string\}"\./,
    )
    // Dead code is worth saying out loud, but it does not break a build.
    expect(r.status).toBe(0)
  })
})
