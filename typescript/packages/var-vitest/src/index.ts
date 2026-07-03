export type { GenerateInput, VarVitestPluginOptions } from './plugin.js'
export { generateVirtualModule } from './plugin.js'
export type { CollectedExample, CollectPorts } from './runtime.js'
export { collectVarExamples } from './runtime.js'
export const VERSION = '0.0.0'

import { varVitestPlugin } from './plugin.js'
export default varVitestPlugin
