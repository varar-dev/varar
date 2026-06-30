import { pathToFileURL } from 'node:url'
import { _resetBuilder, buildRegistry, contextFactory } from '@oselvar/var/registry'
import type { Registry } from '@oselvar/var-core'
import { findSpecs } from './config.js'

export type LoadedSteps = {
  readonly registry: Registry
  readonly createContext: (stepFile: string) => unknown | Promise<unknown>
}

export async function loadSteps(
  stepGlobs: ReadonlyArray<string>,
  cwd: string,
): Promise<LoadedSteps> {
  _resetBuilder()
  for (const path of findSpecs(cwd, stepGlobs)) {
    await import(pathToFileURL(path).href)
  }
  return { registry: buildRegistry(), createContext: contextFactory() }
}
