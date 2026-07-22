# @varar/vitest

The vitest adapter for Varar. Wire the plugin into your `vitest.config.ts` so `.md`
files run as tests, and add the results reporter:

```ts
import vararPlugin from '@varar/vitest'
import { VararResultsReporter } from '@varar/vitest/reporter'

export default { plugins: [vararPlugin()], test: { reporters: ['default', new VararResultsReporter()] } }
```

Write your step definitions against `@varar/varar`, not this package.
