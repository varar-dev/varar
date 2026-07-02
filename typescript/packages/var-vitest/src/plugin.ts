import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { findSpecs, readVarConfig } from '@oselvar/var-runner'
import type { Plugin } from 'vite'
import { configDefaults } from 'vitest/config'

export type VarVitestPluginOptions = {
  readonly cwd?: string
}

// A file is a var spec iff it was discovered by the configured `docs` globs.
// Vite may append a query suffix (e.g. `?v=123`) to module ids, so strip it
// before matching against the discovered absolute paths.
export function isVarSpecId(id: string, specFiles: ReadonlySet<string>): boolean {
  const path = id.split('?')[0] ?? id
  return specFiles.has(path)
}

export function varVitestPlugin(options: VarVitestPluginOptions = {}): Plugin {
  const cwd = options.cwd ?? process.cwd()
  let stepFiles: ReadonlyArray<string> = []
  // Absolute paths of the spec files discovered from `cfg.docs`. The `load`
  // hook transforms only these into virtual test modules — there is no longer
  // a `.md` extension to key off of.
  let specFiles: ReadonlySet<string> = new Set()
  // Scanner-plugin names from var.config.json; forwarded into the generated
  // virtual module so it can re-resolve them via var-core's registry.
  let pluginNames: ReadonlyArray<string> = []
  return {
    name: '@oselvar/var-vitest',
    async config() {
      // var.config.json is the single source of truth for which files are specs.
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
          include: cfg.docs.include.map(abs),
          exclude: [...configDefaults.exclude, ...cfg.docs.exclude.map(abs)],
        },
      }
    },
    async configResolved() {
      const cfg = await readVarConfig(cwd)
      stepFiles = findSpecs(cwd, cfg.steps)
      specFiles = new Set(findSpecs(cwd, cfg.docs.include, cfg.docs.exclude))
      pluginNames = cfg.scannerPluginNames
    },
    async load(id) {
      if (!isVarSpecId(id, specFiles)) return null
      const source = readFileSync(id, 'utf8')
      return generateVirtualModule({
        varPath: id,
        stepImports: stepFiles,
        source,
        scannerPluginNames: pluginNames,
      })
    },
  }
}

export type GenerateInput = {
  readonly varPath: string
  readonly stepImports: ReadonlyArray<string>
  readonly source?: string
  // Scanner-plugin NAMES from var.config.json. The generated module
  // re-resolves them via var-core's registry — functions can't be
  // serialized into generated source, names can.
  readonly scannerPluginNames: ReadonlyArray<string>
}

export function generateVirtualModule(input: GenerateInput): string {
  const sourceJson = JSON.stringify(input.source ?? '')
  const stepImports = input.stepImports.map((p) => `import ${JSON.stringify(p)}`).join('\n')
  const pathJson = JSON.stringify(input.varPath)
  const pluginNamesJson = JSON.stringify(input.scannerPluginNames)
  return `import { test as vitestTest } from 'vitest'
import { resolveScannerPlugins } from '@oselvar/var-core'
import { runVarSource, toFailure } from '@oselvar/var-vitest/runtime'
${stepImports}

const SOURCE = ${sourceJson}
const PATH = ${pathJson}

runVarSource(PATH, SOURCE, {
  sink: {
    example: (name, run, info) =>
      vitestTest(name, async (ctx) => {
        const lines = info?.lines ?? []
        try {
          await run()
          ctx.task.meta.varResult = { name, status: 'passed', lines }
        } catch (error) {
          ctx.task.meta.varResult = {
            name,
            status: 'failed',
            lines,
            failure: toFailure(error, PATH, lines[0] ?? 0),
          }
          throw error
        }
      }),
  },
  reporter: { diagnostic: (d) => vitestTest(\`var:diagnostic:\${d.code}\`, () => { throw new Error(d.message) }) },
  scannerPlugins: resolveScannerPlugins(${pluginNamesJson}),
})
`
}
