import { pathToFileURL } from 'node:url'
import { findFiles } from '@varar/config'
import type { Registry } from '@varar/core'
import { _resetBuilder, buildRegistry, contextFactory } from '@varar/varar/registry'

export type LoadedSteps = {
  readonly registry: Registry
  readonly createContext: (stepFile: string) => unknown | Promise<unknown>
}

// Node refuses a step file for one of two reasons that say nothing about Varar
// and everything about how the project is set up. Both are one-line fixes, so
// say which one rather than surfacing the raw loader error.
export function explainLoadFailure(err: unknown, path: string): unknown {
  const code = (err as { code?: unknown } | null)?.code
  const message = err instanceof Error ? err.message : String(err)
  if (code === 'ERR_UNKNOWN_FILE_EXTENSION') {
    return new Error(
      `cannot load ${path}: this Node version cannot run TypeScript directly. Upgrade to Node 22.18+ (type stripping is on by default), or run with NODE_OPTIONS=--experimental-strip-types.`,
      { cause: err },
    )
  }
  if (message.includes('Cannot use import statement outside a module')) {
    return new Error(
      `cannot load ${path}: step files are ES modules, but the nearest package.json does not say so. Add "type": "module" to it (\`varar init\` does this for you).`,
      { cause: err },
    )
  }
  return err
}

export async function loadSteps(
  stepGlobs: ReadonlyArray<string>,
  cwd: string,
): Promise<LoadedSteps> {
  _resetBuilder()
  for (const path of findFiles(cwd, stepGlobs)) {
    try {
      await import(pathToFileURL(path).href)
    } catch (err) {
      throw explainLoadFailure(err, path)
    }
  }
  return { registry: buildRegistry(), createContext: contextFactory() }
}
