# Vár sample: Java + JUnit + Maven

A small, standalone sample project that runs Markdown specs as tests with
[Vár](https://var.oselvar.com), using the Java author API and the JUnit
Platform engine (`var-junit`). It depends only on released artifacts from
Maven Central — copy it as the starting point for your own project.

## Run it

```sh
mvn test
```

Each example in the Markdown specs becomes one JUnit test.

## How it fits together

- **`var.config.json`** is the single source of truth: `docs.include` globs
  the Markdown specs (here they live outside the project, in the repo's
  shared [`doc/examples/`](../../doc/examples) corpus — in your project they
  can sit anywhere), and `steps` lists the fully-qualified step-definition
  classes.
- **`src/test/java/examples/*Steps.java`** implement `StepDefinitions`: a
  `defineSteps(Registrar)` method binds a state record and registers
  `stimulus`/`sensor` handlers. A stimulus returns the next state, a sensor
  returns a value for Vár to compare against what the Markdown says.
- **`RunVarSpecsTest.java`** is a JUnit `@Suite` that includes the `"var"`
  engine. It exists only because Maven Surefire discovers tests by class name
  — the engine itself needs no wiring beyond having `var-junit` on the test
  classpath. The `*Test` suffix matters: Surefire only scans classes matching
  its naming convention.
