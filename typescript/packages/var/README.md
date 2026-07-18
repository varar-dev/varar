# @varar/varar

The package you write step definitions against. Import `steps`, give it a
factory for your scenario state (and optionally custom parameter types), and use the
returned `stimulus` / `sensor` functions to bind Cucumber-expression steps.

```ts
import { steps } from '@varar/varar'

const { stimulus, sensor } = steps(() => ({ greeting: '' }))
stimulus('I greet {string}', (_state, name) => ({ greeting: `Hello, ${name}!` }))
sensor('the greeting is {string}', (state) => state.greeting)
```

This is a thin stateful shell over the pure `@varar/core`. Adapters use the
`@varar/varar/registry` subpath for the registry-building glue; step authors never
need it.
