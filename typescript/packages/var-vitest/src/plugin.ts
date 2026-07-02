import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { ScannerPlugin } from '@oselvar/var-core'
import { findSpecs, readVarConfig } from '@oselvar/var-runner'
import type { Plugin } from 'vite'
import { configDefaults } from 'vitest/config'
import { discoverStaticExamples, type StaticExample } from './static-examples.js'

export type VarVitestPluginOptions = {
  readonly cwd?: string
}

// A file is a var spec iff it was discovered by the configured `vars` globs.
// Vite may append a query suffix (e.g. `?v=123`) to module ids, so strip it
// before matching against the discovered absolute paths.
export function isVarSpecId(id: string, specFiles: ReadonlySet<string>): boolean {
  const path = id.split('?')[0] ?? id
  return specFiles.has(path)
}

export function varVitestPlugin(options: VarVitestPluginOptions = {}): Plugin {
  const cwd = options.cwd ?? process.cwd()
  let stepFiles: ReadonlyArray<string> = []
  // Absolute paths of the spec files discovered from `cfg.vars`. The `load`
  // hook transforms only these into virtual test modules — there is no longer
  // a `.md` extension to key off of.
  let specFiles: ReadonlySet<string> = new Set()
  // Absolute path to var.config.ts when one exists; the generated virtual
  // module imports it directly so its scannerPlugins reach the runtime, and
  // the load hook forwards them to the static planner.
  let configPath: string | undefined
  let scannerPlugins: ReadonlyArray<ScannerPlugin> = []
  return {
    name: '@oselvar/var-vitest',
    async config() {
      // var.config.ts is the single source of truth for which files are specs.
      // Drive vitest's collection from it so an excluded `.md` is never handed
      // to vite as a raw-markdown "script" (which fails to parse). Globs are
      // made absolute against `cwd`; setting `test.exclude` *replaces* vitest's
      // defaults, so re-add `configDefaults.exclude` to keep `node_modules` &c.
      // out.
      const cfg = await readVarConfig(cwd)
      const abs = (g: string) => resolve(cwd, g)
      return {
        // Force a single @oselvar/var (and @oselvar/var-core) module instance.
        // The authoring API (defineState) and the registry glue
        // (@oselvar/var/registry, used by runtime.ts) MUST share one module so
        // buildRegistry() sees the steps registered via defineState. Under
        // resolve.preserveSymlinks these can split into two instances, leaving
        // an empty registry and zero steps run with no error — so we dedupe.
        resolve: { dedupe: ['@oselvar/var', '@oselvar/var-core'] },
        test: {
          include: cfg.vars.include.map(abs),
          exclude: [...configDefaults.exclude, ...cfg.vars.exclude.map(abs)],
        },
      }
    },
    async configResolved() {
      const cfg = await readVarConfig(cwd)
      stepFiles = findSpecs(cwd, cfg.steps)
      specFiles = new Set(findSpecs(cwd, cfg.vars.include, cfg.vars.exclude))
      scannerPlugins = cfg.scannerPlugins
      for (const name of ['var.config.ts', 'var.config.js', 'var.config.mjs']) {
        const abs = resolve(cwd, name)
        if (existsSync(abs)) {
          configPath = abs
          break
        }
      }
    },
    async load(id) {
      if (!isVarSpecId(id, specFiles)) return null
      const varPath = id.split('?')[0] ?? id
      const source = readFileSync(varPath, 'utf8')
      // The transform result depends on the step definitions (they decide
      // which paragraphs are examples), so a step-file edit must re-transform
      // every spec in watch mode.
      for (const f of stepFiles) this.addWatchFile(f)
      if (configPath) this.addWatchFile(configPath)
      const examples = discoverStaticExamples({
        varPath,
        source,
        stepFiles: stepFiles.map((path) => ({ path, source: readFileSync(path, 'utf8') })),
        scannerPlugins,
      })
      return generateVirtualModule({
        varPath,
        stepImports: stepFiles,
        source,
        configPath,
        examples,
      })
    },
  }
}

export type GenerateInput = {
  readonly varPath: string
  readonly stepImports: ReadonlyArray<string>
  readonly source?: string
  // Absolute path to a var.config.ts file. When present, the generated
  // virtual module imports it as `varConfig` and forwards its
  // `scannerPlugins` to the runtime.
  readonly configPath?: string | undefined
  // Statically discovered examples (see discoverStaticExamples). Each one
  // becomes a `test("literal name", ...)` call placed at its own markdown
  // line/column.
  readonly examples?: ReadonlyArray<StaticExample>
}

// The generated module preserves an IDENTITY LINE MAPPING to the markdown
// source: all imports and setup are squeezed onto line 1, and each example's
// `test(...)` call sits at the example's own line and column. Runtime stack
// traces (vitest's includeTaskLocation) and editor AST discovery therefore
// point at the right spec line — with a string-literal test name — without
// any source map.
export function generateVirtualModule(input: GenerateInput): string {
  const sourceJson = JSON.stringify(input.source ?? '')
  const pathJson = JSON.stringify(input.varPath)
  const examples = input.examples ?? []
  const header: string[] = [
    "import { test } from 'vitest'",
    "import { collectVarExamples, varTestBody } from '@oselvar/var-vitest/runtime'",
    input.configPath
      ? `import varConfig from ${JSON.stringify(input.configPath)}`
      : 'const varConfig = {}',
    ...input.stepImports.map((p) => `import ${JSON.stringify(p)}`),
    `const PATH = ${pathJson}`,
    // Diagnostics and the stale-transform guard register their tests inside
    // collectVarExamples, so the only `test(...)` callsites in this module
    // are the real per-example ones below — static AST discovery sees an
    // exact test tree.
    `const EXAMPLES = collectVarExamples(PATH, ${sourceJson}, { scannerPlugins: varConfig?.scannerPlugins ?? [], expectedCount: ${examples.length} })`,
  ]
  const testCall = (ex: StaticExample, i: number): string => {
    const nameJson = JSON.stringify(ex.name)
    return `test(${nameJson}, varTestBody(EXAMPLES, ${i}, ${nameJson}, PATH))`
  }
  const lastLine = Math.max(1, ...examples.map((e) => e.line))
  const lines: string[] = new Array(lastLine).fill('')
  lines[0] = header.join(';')
  examples.forEach((ex, i) => {
    if (ex.line <= 1) {
      lines[0] += `;${testCall(ex, i)}`
    } else {
      const at = ex.line - 1
      const indented = ' '.repeat(Math.max(0, ex.col - 1)) + testCall(ex, i)
      lines[at] = lines[at] ? `${lines[at]};${testCall(ex, i)}` : indented
    }
  })
  return `${lines.join('\n')}\n`
}
