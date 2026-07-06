export type { GenerateInput, VarVitestPluginOptions } from './plugin.ts'
export { generateVirtualModule } from './plugin.ts'
export type { CollectedExample, CollectPorts } from './runtime.ts'
export { collectVarExamples } from './runtime.ts'
export const VERSION = '0.0.0'

import { varVitestPlugin } from './plugin.ts'
export default varVitestPlugin
