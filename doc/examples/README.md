# The Vár example corpus

Language-neutral Markdown specs, one directory per example. Every language
port runs (a subset of) these through its own **examples project** — a small,
standalone sample you can copy as the starting point for a real project:

| Sample project | Stack | Run with |
| --- | --- | --- |
| [`typescript/examples`](../../typescript/examples) | TypeScript + vitest (workspace deps — the dogfood suite) | `pnpm test` from `typescript/` |
| [`java/examples-kotlin-junit`](../../java/examples-kotlin-junit) | Kotlin + JUnit + Gradle (Maven Central artifacts) | `./gradlew test` |
| [`java/examples-kotlin-kotest`](../../java/examples-kotlin-kotest) | Kotlin + Kotest + Gradle (Maven Central artifacts) | `./gradlew test` |
| [`java/examples-java-junit-maven`](../../java/examples-java-junit-maven) | Java + JUnit + Maven (Maven Central artifacts) | `mvn test` |
| [`java/examples-java-junit-gradle`](../../java/examples-java-junit-gradle) | Java + JUnit + Gradle (Maven Central artifacts) | `./gradlew test` |
| [`python/examples-pytest`](../../python/examples-pytest) | Python + pytest (path deps until PyPI publishing resumes) | `uv run pytest` |

The TypeScript project implements every example (the website embeds several
of them); the other ports implement a feature-covering subset — `hello-var`
(basic steps), `tables-and-docstrings` (whole tables + doc strings), and
`yahtzee` (header-bound table rows).

Specs deliberately live here, away from any step definitions, to mirror a
real project: the `.md` files are prose owned by the whole team, and each
sample's `var.config.json` points at them with `docs.include` globs.

These are showcase examples. The byte-for-byte cross-port contract lives in
[`conformance/`](../../conformance), which every port's conformance harness
runs against golden files — don't mix the two.
