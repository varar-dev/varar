// The step registration API lives in @oselvar/var-runtime so multiple
// adapters (vitest, the standalone CLI runner, and future bun/deno
// runtimes) all share the same module-scope registry. This file stays as
// a re-export so step files that import from @oselvar/var-vitest don't
// have to change.

export type { RoleFn, SensorFn, Step } from '@oselvar/var-runtime'
export {
  _resetBuilder,
  action,
  buildRegistry,
  context,
  contextFactory,
  defineContext,
  defineParameterType,
  defineState,
  sensor,
  step,
} from '@oselvar/var-runtime'
