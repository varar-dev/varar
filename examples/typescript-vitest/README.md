# Vár sample: TypeScript + vitest

A small, standalone sample project that runs Markdown specs as tests with
[Vár](https://varar.dev), using the vitest plugin (`@varar/vitest`).
Copy it as the starting point for your own project.

The `.md` files at the project root are the specs — they run as tests.

## Run it

```sh
pnpm install
pnpm test
```

Each example in the Markdown specs becomes one vitest test.

## How it fits together

- **`varar.config.json`** is the single source of truth: `docs.include` globs
  the Markdown specs and `steps` globs the step-definition files. The vitest
  plugin drives vitest's own include/exclude from it.
- **`steps/*.steps.ts`** define the steps with `steps` +
  `stimulus`/`sensor`. A stimulus returns the next state, a sensor returns a
  value for Vár to compare against what the Markdown says.
- **`steps/yahtzee.ts`** and **`steps/roman-numerals.ts`** are the sample's
  domain code, imported by the steps like any other module.

## Versioning note

In the `oselvar/varar` monorepo this project uses `workspace:*` dependencies
(it is the dogfood suite, gating trunk); in `varar-examples` the
release sync pins them to the released npm packages.
