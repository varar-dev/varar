export type { VarConfig, VarDoc } from '@oselvar/var'
export { loadVarConfig } from '@oselvar/var/node'
export type { RoleFn, SensorFn, Step } from './api.js'
export { action, context, defineContext, defineParameterType, defineState, sensor, step } from './api.js'
export type { GenerateInput, VarVitestPluginOptions } from './plugin.js'
export { generateVirtualModule } from './plugin.js'
export type { RunPorts } from './runtime.js'
export { runVarSource } from './runtime.js'
export const VERSION = '0.0.0'

import { varVitestPlugin } from './plugin.js'
export default varVitestPlugin
