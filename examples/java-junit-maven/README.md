# Vár sample: Java + JUnit + Maven

A small, standalone sample project that runs Markdown specs as tests with
[Vár](https://varar.dev), using the Java author API and the JUnit
Platform engine (`var-junit`). Copy it as the starting point for your own
project.

The `.md` files at the project root are the specs — they run as tests.

## Run it

```sh
mvn test
```

Each example in the Markdown specs becomes one JUnit test.

## How it fits together

- **`varar.config.json`** is the single source of truth: `docs.include` globs
  the Markdown specs, and `steps` lists the fully-qualified step-definition
  classes.
- **`src/test/java/examples/*Steps.java`** implement `StepDefinitions`: a
  `defineSteps(Registrar)` method binds a state record and registers
  `stimulus`/`sensor` handlers. A stimulus returns the next state, a sensor
  returns a value for Vár to compare against what the Markdown says.
- **`src/main/java/examples/{Library,RomanNumerals,Yahtzee}.java`** are the
  sample's domain code (the system under test) — ordinary classes the steps
  call, kept in the production source set (`src/main`) separate from the test
  steps, just like your production code.
- **`RunVarSpecsTest.java`** is a JUnit `@Suite` that includes the `"var"`
  engine. It exists only because Maven Surefire discovers tests by class name
  — the engine itself needs no wiring beyond having `var-junit` on the test
  classpath. The `*Test` suffix matters: Surefire only scans classes matching
  its naming convention.

## Versioning note

In the `oselvar/var` monorepo `<var.version>` is the SNAPSHOT that
`mvn install` (run from `java/`) puts into the local Maven repository, so the
sample gates trunk; in `oselvar/varar-examples` the release sync pins it to the
released Maven Central artifacts.
