# Varar sample: Kotlin + Kotest + Gradle

A small, standalone sample project that runs Markdown specs as tests with
[Varar](https://varar.dev), using the Kotlin DSL (`var-kotlin`) and the
Kotest adapter (`var-kotest`). Copy it as the starting point for your own
project.

The `.md` files at the project root are the specs — they run as tests.

## Run it

```sh
./gradlew test
```

Each example in the Markdown specs becomes one Kotest test.

## How it fits together

- **`varar.config.json`** is the single source of truth: `docs.include` globs
  the Markdown specs, and `steps` lists the fully-qualified step-definition
  classes. For a Kotlin file with a top-level `val steps = steps(...)`,
  that's the file-facade class pinned by `@file:JvmName(...)`.
- **`src/test/kotlin/examples/*.steps.kt`** define the steps with
  `steps` + `stimulus`/`sensor`. State is the lambda receiver; a
  stimulus returns the next state (`copy(...)`), a sensor returns a value for
  Varar to compare against what the Markdown says.
- **`src/main/kotlin/examples/{Library,RomanNumerals,Yahtzee}.kt`** are the
  sample's domain code (the system under test) — ordinary classes the steps
  call, kept in the production source set (`src/main`) separate from the test
  steps, just like your production code.
- **`ExamplesSpec.kt`** extends `VarSpec`, a Kotest `FunSpec` that loads
  `varar.config.json` (from the test working directory by default) and registers
  one test per planned example. Because it's an ordinary Kotest spec class, no
  discovery workarounds are needed.

## Versioning note

In the `varar-dev/varar` monorepo `varVersion` is the SNAPSHOT that `mvn install`
(run from `java/`) puts into the local Maven repository, so the sample gates
trunk; in `varar-dev/varar-examples` the release sync pins it to the released
Maven Central artifacts.
