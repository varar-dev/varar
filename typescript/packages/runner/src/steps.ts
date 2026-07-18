import { pathToFileURL } from 'node:url'
import { findFiles } from '@varar/config'
import type { Registry } from '@varar/core'
import { _resetBuilder, buildRegistry, contextFactory } from '@varar/varar/registry'

export type LoadedSteps = {
  readonly registry: Registry
  readonly createContext: (stepFile: string) => unknown | Promise<unknown>
}

export async function loadSteps(
  stepGlobs: ReadonlyArray<string>,
  cwd: string,
): Promise<LoadedSteps> {
  _resetBuilder()
  for (const path of findFiles(cwd, stepGlobs)) {
    await import(pathToFileURL(path).href)
  }
  return { registry: buildRegistry(), createContext: contextFactory() }
}
