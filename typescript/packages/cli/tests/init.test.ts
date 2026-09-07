import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import languages from '../../../../languages.json' with { type: 'json' }
import { VERSION } from '../src/index.ts'
import { runInit } from '../src/init.ts'

test('scaffolds varar.config.json and an example .md + steps file', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'varar-init-'))
  try {
    const result = await runInit({ cwd: dir, writeStdout: () => {} })
    expect(result.exitCode).toBe(0)
    expect(existsSync(join(dir, 'varar.config.json'))).toBe(true)
    expect(existsSync(join(dir, 'varar/deep-thought.md'))).toBe(true)
    expect(existsSync(join(dir, 'src/varar/deep-thought.steps.ts'))).toBe(true)
    const exampleMd = readFileSync(join(dir, 'varar/deep-thought.md'), 'utf8')
    // The scaffolded oath is plain prose — no Given/When/Then keyword ceremony.
    expect(exampleMd).not.toMatch(/^\s*(Given|When|Then)\b/m)
    const stepsTs = readFileSync(join(dir, 'src/varar/deep-thought.steps.ts'), 'utf8')
    expect(stepsTs).toContain('steps')
    expect(stepsTs).toContain('sensor(')
    expect(stepsTs).toContain('=> 42')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('the scaffolded config uses the steps glob declared for TypeScript in languages.json', async () => {
  // Guards against the CLI's init template drifting from the shared language
  // manifest (the single source of truth every port scaffolds from).
  const ts = languages.find((l) => l.id === 'ts')
  expect(ts).toBeDefined()
  const dir = mkdtempSync(join(tmpdir(), 'varar-init-manifest-'))
  try {
    await runInit({ cwd: dir, writeStdout: () => {} })
    const config = JSON.parse(readFileSync(join(dir, 'varar.config.json'), 'utf8'))
    expect(config.steps).toContain(ts?.stepsGlob)
    expect(ts?.stepsGlob.endsWith(ts.ext)).toBe(true)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('refuses to overwrite an existing varar.config.json; reports which files were skipped', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'varar-init-conflict-'))
  try {
    writeFileSync(join(dir, 'varar.config.json'), '{ "docs": { "include": [] } }')
    const captured: string[] = []
    const result = await runInit({ cwd: dir, writeStdout: (s) => captured.push(s) })
    expect(result.exitCode).toBe(0)
    expect(readFileSync(join(dir, 'varar.config.json'), 'utf8')).toBe(
      '{ "docs": { "include": [] } }',
    )
    expect(captured.join('')).toContain('skipped')
    expect(captured.join('')).toContain('varar.config.json')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('creates a package.json with "type": "module" when the project has none', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'varar-init-nopkg-'))
  try {
    const captured: string[] = []
    await runInit({ cwd: dir, writeStdout: (s) => captured.push(s) })
    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
    expect(pkg.type).toBe('module')
    expect(captured.join('')).toContain('created package.json')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('adds "type": "module" to a package.json that declares no type, keeping its other fields', async () => {
  // The `npm init -y` case: the scaffolded .steps.ts is an ES module, so
  // without this the runner fails with "Cannot use import statement outside a
  // module".
  const dir = mkdtempSync(join(tmpdir(), 'varar-init-addtype-'))
  try {
    writeFileSync(join(dir, 'package.json'), '{ "name": "demo", "version": "1.0.0" }')
    const captured: string[] = []
    await runInit({ cwd: dir, writeStdout: (s) => captured.push(s) })
    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
    expect(pkg).toEqual({
      name: 'demo',
      version: '1.0.0',
      type: 'module',
      // Ranges come from the runner table; the adapter's tracks the CLI's own,
      // so a release bump does not strand this expectation.
      devDependencies: {
        '@varar/varar': `^${VERSION}`,
        '@varar/vitest': `^${VERSION}`,
        vitest: '^5.0.0',
      },
    })
    expect(captured.join('')).toContain('updated package.json')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('never rewrites a type the project already chose, and warns when it is not module', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'varar-init-cjs-'))
  try {
    const original = '{ "name": "demo", "type": "commonjs" }'
    writeFileSync(join(dir, 'package.json'), original)
    const captured: string[] = []
    await runInit({ cwd: dir, writeStdout: (s) => captured.push(s) })
    // The `type` the project chose stands; only the runner deps are added.
    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
    expect(pkg.type).toBe('commonjs')
    expect(pkg.name).toBe('demo')
    expect(captured.join('')).toContain('warning')
    expect(captured.join('')).toContain('"commonjs"')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('scaffolds a runnable vitest project: config, devDependencies, and a report of what it chose', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'varar-init-runner-'))
  try {
    const captured: string[] = []
    await runInit({ cwd: dir, writeStdout: (s) => captured.push(s) })
    const out = captured.join('')
    // Detection reports what it picked and why — a wrong guess writes files.
    expect(out).toContain('using vitest (nothing else to go on)')
    const config = readFileSync(join(dir, 'vitest.config.ts'), 'utf8')
    expect(config).toContain('vararPlugin()')
    expect(config).toContain('new VararResultsReporter()')
    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
    expect(Object.keys(pkg.devDependencies)).toEqual(['@varar/varar', '@varar/vitest', 'vitest'])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('running twice is a no-op the second time', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'varar-init-twice-'))
  try {
    await runInit({ cwd: dir, writeStdout: () => {} })
    const before = readFileSync(join(dir, 'vitest.config.ts'), 'utf8')
    const pkgBefore = readFileSync(join(dir, 'package.json'), 'utf8')
    const captured: string[] = []
    await runInit({ cwd: dir, writeStdout: (s) => captured.push(s) })
    const out = captured.join('')
    expect(out).toContain('skipped varar.config.json (already exists)')
    expect(out).toContain('skipped vitest.config.ts (already configured)')
    expect(out).toContain('skipped devDependencies (already present)')
    expect(readFileSync(join(dir, 'vitest.config.ts'), 'utf8')).toBe(before)
    expect(readFileSync(join(dir, 'package.json'), 'utf8')).toBe(pkgBefore)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('wires a hand-written vitest.config.ts, keeping what it already declared', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'varar-init-wire-'))
  try {
    writeFileSync(
      join(dir, 'vitest.config.ts'),
      "import { defineConfig } from 'vitest/config'\n\nexport default defineConfig({\n  test: {\n    globals: true,\n  },\n})\n",
    )
    const captured: string[] = []
    await runInit({ cwd: dir, writeStdout: (s) => captured.push(s) })
    expect(captured.join('')).toContain('updated vitest.config.ts')
    const config = readFileSync(join(dir, 'vitest.config.ts'), 'utf8')
    expect(config).toContain('vararPlugin()')
    expect(config).toContain('new VararResultsReporter()')
    expect(config).toContain('globals: true')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('leaves a config it cannot edit safely byte-identical, and prints the snippet instead', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'varar-init-snippet-'))
  try {
    // An exported variable — not a shape a string edit can reason about.
    const original = 'const config = { test: { globals: true } }\nexport default config\n'
    writeFileSync(join(dir, 'vitest.config.ts'), original)
    const captured: string[] = []
    await runInit({ cwd: dir, writeStdout: (s) => captured.push(s) })
    const out = captured.join('')
    expect(out).toContain('skipped vitest.config.ts (not a shape var can edit safely)')
    expect(out).toContain('vararPlugin()')
    expect(readFileSync(join(dir, 'vitest.config.ts'), 'utf8')).toBe(original)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('--runner jest exits non-zero with the no-adapter message, writing nothing', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'varar-init-jest-'))
  try {
    const err: string[] = []
    const result = await runInit({
      cwd: dir,
      writeStdout: () => {},
      writeStderr: (s) => err.push(s),
      runner: 'jest',
    })
    expect(result.exitCode).toBe(1)
    expect(err.join('')).toContain('no Jest adapter yet')
    expect(existsSync(join(dir, 'varar.config.json'))).toBe(false)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('adds .varar/ to an existing .gitignore, but never creates one', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'varar-init-gitignore-'))
  try {
    await runInit({ cwd: dir, writeStdout: () => {} })
    expect(existsSync(join(dir, '.gitignore'))).toBe(false)
    writeFileSync(join(dir, '.gitignore'), 'node_modules\n')
    await runInit({ cwd: dir, writeStdout: () => {} })
    expect(readFileSync(join(dir, '.gitignore'), 'utf8')).toBe('node_modules\n.varar/\n')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
