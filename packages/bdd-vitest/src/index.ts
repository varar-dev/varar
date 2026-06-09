export type { Bdd } from '@oselvar/bdd'
export { step, defineContext, defineParameterType } from './api.js'
export type { Step } from './api.js'
export { loadBddConfig } from '@oselvar/bdd'
export type { BddConfig } from '@oselvar/bdd'
export { runBddSource } from './runtime.js'
export type { RunPorts } from './runtime.js'
export { bddVitestPlugin, generateVirtualModule } from './plugin.js'
export type { BddVitestPluginOptions, GenerateInput } from './plugin.js'
export const VERSION = '0.0.0'

import { bddVitestPlugin } from './plugin.js'
export default bddVitestPlugin
