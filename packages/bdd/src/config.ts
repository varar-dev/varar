import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { DEFAULT_SNIPPET_TEMPLATE } from './snippet-template.js'

export type BddConfig = {
  readonly bdds: ReadonlyArray<string>
  readonly steps: ReadonlyArray<string>
  readonly snippet: { readonly template: string }
}

const DEFAULT_CONFIG: BddConfig = {
  bdds: ['**/*.bdd.md'],
  steps: ['**/*.steps.ts'],
  snippet: { template: DEFAULT_SNIPPET_TEMPLATE },
}

type UserConfig = {
  readonly bdds?: ReadonlyArray<string>
  readonly steps?: ReadonlyArray<string>
  readonly snippet?: { readonly template?: string }
}

export async function loadBddConfig(cwd: string): Promise<BddConfig> {
  const candidates = ['bdd.config.ts', 'bdd.config.js', 'bdd.config.mjs']
  for (const name of candidates) {
    const path = resolve(cwd, name)
    if (!existsSync(path)) continue
    const mod = await import(pathToFileURL(path).href)
    const cfg = (mod.default ?? mod) as UserConfig
    return {
      bdds: cfg.bdds ?? DEFAULT_CONFIG.bdds,
      steps: cfg.steps ?? DEFAULT_CONFIG.steps,
      snippet: {
        template: cfg.snippet?.template ?? DEFAULT_CONFIG.snippet.template,
      },
    }
  }
  return DEFAULT_CONFIG
}
