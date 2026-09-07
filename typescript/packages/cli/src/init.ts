import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { VERSION } from './index.ts'
import {
  detectRunner,
  noAdapterMessage,
  type ProjectProbe,
  type Runner,
  runnerById,
} from './runners.ts'
import { parsesAsTypeScript } from './ts-syntax.ts'

const CONFIG = `{
  "docs": { "include": ["varar/**/*.md"], "exclude": [] },
  "steps": ["src/varar/**/*.steps.ts"]
}
`

const EXAMPLE_MD = `# Deep Thought

You're really not going to like it.

The answer to the great question of life, the universe and everything is 42.

It was a tough assignment.
`

const EXAMPLE_STEPS = `import { steps } from '@varar/varar'

const { sensor } = steps()

sensor('life, the universe and everything is {int}', () => 42)
`

export type InitOptions = {
  readonly cwd: string
  readonly writeStdout: (s: string) => void
  readonly writeStderr?: (s: string) => void
  // `--runner`. Always wins over detection.
  readonly runner?: string | undefined
}

export type InitResult = { readonly exitCode: number }

// The scaffolded step file is an ES module (`import { steps } …`), so Node only
// loads it when the nearest package.json says `"type": "module"`. Add it when
// the field is absent, but never rewrite a `type` the project already chose —
// that is the project's decision, and flipping it would break its other files.
function ensureEsm(cwd: string, writeStdout: (s: string) => void): void {
  const target = join(cwd, 'package.json')
  if (!existsSync(target)) {
    writeFileSync(target, `${JSON.stringify({ type: 'module' }, null, 2)}\n`)
    writeStdout('created package.json (type: module)\n')
    return
  }
  let pkg: Record<string, unknown>
  try {
    pkg = JSON.parse(readFileSync(target, 'utf8')) as Record<string, unknown>
  } catch {
    writeStdout('skipped package.json (not valid JSON) — add "type": "module" yourself\n')
    return
  }
  if (pkg.type === 'module') {
    writeStdout('skipped package.json (already "type": "module")\n')
    return
  }
  if (pkg.type !== undefined) {
    writeStdout(
      `warning: package.json says "type": ${JSON.stringify(pkg.type)}, left as is — the scaffolded .steps.ts is an ES module and will not load until it is "module"\n`,
    )
    return
  }
  writeFileSync(target, `${JSON.stringify({ ...pkg, type: 'module' }, null, 2)}\n`)
  writeStdout('updated package.json (added "type": "module")\n')
}

function readPackageJson(cwd: string): Record<string, unknown> | null {
  const target = join(cwd, 'package.json')
  if (!existsSync(target)) return null
  try {
    return JSON.parse(readFileSync(target, 'utf8')) as Record<string, unknown>
  } catch {
    return null
  }
}

// Everything detection is allowed to look at, gathered in one place so the rules
// themselves stay pure (see runners.ts).
function probe(cwd: string): ProjectProbe {
  const pkg = readPackageJson(cwd)
  const dev = (pkg?.devDependencies ?? {}) as Record<string, string>
  const scripts = (pkg?.scripts ?? {}) as Record<string, string>
  return {
    files: new Set(existsSync(cwd) ? readdirSync(cwd) : []),
    devDependencies: Object.keys(dev),
    hasJestKey: pkg?.jest !== undefined,
    testScript: scripts.test,
  }
}

// Write the runner's config, or wire an existing one. `init`'s contract is
// NEVER CLOBBER, and this is the only file it touches that the user may have
// written, so the fallback is always to print the snippet and leave the file
// byte-identical.
function ensureRunnerConfig(cwd: string, runner: Runner, writeStdout: (s: string) => void): void {
  const existing = runner.configFiles.find((f) => existsSync(join(cwd, f)))
  if (!existing) {
    writeFileSync(join(cwd, runner.configFile), runner.config)
    writeStdout(`created ${runner.configFile}\n`)
    return
  }
  const target = join(cwd, existing)
  const source = readFileSync(target, 'utf8')
  if (runner.wiredMarkers.some((m) => source.includes(m))) {
    writeStdout(`skipped ${existing} (already configured)\n`)
    return
  }
  const wired = runner.wire(source)
  if (wired !== null && parsesAsTypeScript(wired)) {
    writeFileSync(target, wired)
    writeStdout(`updated ${existing} (added the var plugin and reporter)\n`)
    return
  }
  writeStdout(
    `skipped ${existing} (not a shape var can edit safely) — add this to it yourself:\n\n${runner.snippet}\n`,
  )
}

// Add what the scaffold needs to run, without ever repinning a version the
// project already chose.
function ensureDevDependencies(
  cwd: string,
  runner: Runner,
  writeStdout: (s: string) => void,
): void {
  const pkg = readPackageJson(cwd)
  if (!pkg) return
  const dev = { ...((pkg.devDependencies ?? {}) as Record<string, string>) }
  const added: string[] = []
  for (const [name, range] of runner.devDependencies(VERSION)) {
    if (dev[name] !== undefined) continue
    dev[name] = range
    added.push(`${name}@${range}`)
  }
  if (added.length === 0) {
    writeStdout('skipped devDependencies (already present)\n')
    return
  }
  const next = { ...pkg, devDependencies: Object.fromEntries(Object.entries(dev).sort()) }
  writeFileSync(join(cwd, 'package.json'), `${JSON.stringify(next, null, 2)}\n`)
  writeStdout(`updated package.json (devDependencies: ${added.join(', ')})\n`)
}

// Run records are build artifacts, not sources. Only amend a .gitignore the
// project already has — creating one is a decision that is not init's to make.
function ensureGitignore(cwd: string, writeStdout: (s: string) => void): void {
  const target = join(cwd, '.gitignore')
  if (!existsSync(target)) return
  const source = readFileSync(target, 'utf8')
  if (/^\.varar\/?$/m.test(source)) {
    writeStdout('skipped .gitignore (already ignores .varar/)\n')
    return
  }
  const sep = source.length === 0 || source.endsWith('\n') ? '' : '\n'
  writeFileSync(target, `${source}${sep}.varar/\n`)
  writeStdout('updated .gitignore (added .varar/)\n')
}

export async function runInit(opts: InitOptions): Promise<InitResult> {
  const writeStderr = opts.writeStderr ?? (() => {})
  // Resolve the runner BEFORE writing anything: a project whose oaths cannot run
  // should be left untouched, not half-scaffolded.
  let runner: Runner
  if (opts.runner !== undefined) {
    const chosen = runnerById(opts.runner)
    if (!chosen) {
      writeStderr(`varar: unknown runner "${opts.runner}". Known runners: vitest, jest.\n`)
      return { exitCode: 1 }
    }
    runner = chosen
  } else {
    const detected = detectRunner(probe(opts.cwd))
    runner = detected.runner
    opts.writeStdout(`using ${runner.id} (${detected.reason})\n`)
  }
  if (runner.adapter === null) {
    writeStderr(noAdapterMessage(runner))
    return { exitCode: 1 }
  }

  const files: Array<{ readonly relPath: string; readonly content: string }> = [
    { relPath: 'varar.config.json', content: CONFIG },
    { relPath: 'varar/deep-thought.md', content: EXAMPLE_MD },
    { relPath: 'src/varar/deep-thought.steps.ts', content: EXAMPLE_STEPS },
  ]
  for (const f of files) {
    const target = join(opts.cwd, f.relPath)
    if (existsSync(target)) {
      opts.writeStdout(`skipped ${f.relPath} (already exists)\n`)
      continue
    }
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, f.content)
    opts.writeStdout(`created ${f.relPath}\n`)
  }
  ensureEsm(opts.cwd, opts.writeStdout)
  ensureRunnerConfig(opts.cwd, runner, opts.writeStdout)
  ensureDevDependencies(opts.cwd, runner, opts.writeStdout)
  ensureGitignore(opts.cwd, opts.writeStdout)
  return { exitCode: 0 }
}
