# ADR 0006 — Rust as the sixth language port (full pipeline)

- **Status:** Proposed
- **Date:** 2026-07-12
- **Deciders:** Andreas Koestler
- **Tags:** rust, cross-language, port

## Context

TypeScript (reference), Python, Java, Kotlin, and Ruby are complete ports (ADRs
[0001](0001-second-language-python.md), [0004](0004-ruby-port.md)). Rust is
picked up next. Per the [`adding-a-language-port`](../../.claude/skills/adding-a-language-port/SKILL.md)
skill, the first decision is mechanical: **does the target share a runtime with
an already-ported language?** Rust does not (no interop with the JS, CPython,
JVM, or Ruby runtimes), so — like Python and Ruby, and unlike Kotlin-over-Java —
Rust is a **full pipeline port** gated on all four conformance artifacts, not a
facade over an existing engine.

### Why Rust, why now

- A **dependency-light, GC-free native core** widens where var can run: CLI
  tools, embedded/systems test suites, and — the strategic pull — a **WebAssembly**
  target for the browser playground and the website's live spec runner, which
  today shells out to the TS core.
- Rust's ownership model makes the project's **immutable-by-construction**
  principle a compiler guarantee rather than a runtime convention (Python/Ruby
  need a `deep_freeze` helper; Rust needs none).
- It exercises the port seams against a **statically-typed, non-UTF-16** language
  a second time (after the JVM), validating that the shared conformance corpus is
  genuinely language-neutral.

### Current state

`var-core` is already ported and conformance-green on the **var-doc** artifact
(209 tests, ported 1:1 from the Java suite; drift/hash unit-gated). A standalone
`examples/rust-cargotest` sample runs the six shared example specs via
`cargo test` and matches the Python samples byte-for-byte. What remains is the
rest of the package shape and the three deferred golden gates — see the
[completion plan](../superpowers/plans/2026-07-12-rust-port-completion.md).

## Decision

Rust is a **full pipeline port** against the TypeScript reference, gated on all
four conformance artifacts (`var-doc`, `registry`, `plan`, `trace`) × 15 bundles
plus the config corpus, with drift unit-gated. The package shape mirrors the
other full ports (`var-core`, `var` facade, `var-config`, `var-runner`, one
test-framework adapter). Two author-API forks are settled by what `var-core`
already implements, matching the JVM ports rather than the dynamic ones:

- **Registration:** an **injected Registrar** (`register(Registry) -> Registry`),
  not a module-scope accumulator — Rust has no clean import-for-side-effect.
- **State evolution:** **full replacement** (a `stimulus` returns the whole next
  state as a `Value`), not TS/Python shallow partial-merge.

## Consequences

- The three deferred golden gates (`registry`/`plan`/`trace`) require per-bundle
  `*.steps.rs` fixtures and live in the `var` facade crate's conformance harness,
  mirroring Java's `var` module.
- **cucumber-expressions divergence (accepted risk):** no official Rust port of
  the `20.0.0` line the other ports pin exists. `var-core` uses the community
  `cucumber-expressions` `0.5` crate for the grammar AST only, hand-writing the
  regexp generation and argument extraction; `{float}` is omitted (needs
  lookahead the `regex` crate lacks; unused by the corpus). The
  `registry`/`plan` golden gates are the acceptance test for this deviation.
- The `regex` crate has **no lookahead**, so custom parameter types authored with
  lookahead (e.g. the `library` sample's money type) must use a lookahead-free
  equivalent. Recorded here so it is not mistaken for a bug.
- The cargo test-framework integration mechanism is its own decision:
  [ADR 0007](0007-rust-cargo-test-integration.md).
