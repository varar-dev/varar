# Rust facade + config + runner + cargo adapter — design

Date: 2026-07-12
Status: design, pending implementation (TDD)

The remaining runtime of the Rust port ([ADR 0006](../../adr/0006-rust-port.md)),
sitting on the already-conformance-green `var-core`. Scope: the `var` author
facade (and, hosted there, the three deferred `registry`/`plan`/`trace` golden
gates), the `var-config` reader, the `var-runner` imperative shell, and the
`var-cargotest` adapter ([ADR 0007](../../adr/0007-rust-cargo-test-integration.md)).
Python and Ruby are the closest precedents (dynamically-vs-statically typed
aside, both are full ports whose runner/adapter sit on a proven core); read
[`2026-07-07-ruby-runner-adapters.md`](../plans/2026-07-07-ruby-runner-adapters.md)
and [`2026-06-30-var-pytest-plugin-design.md`](2026-06-30-var-pytest-plugin-design.md)
alongside.

## Why this scope

`var-core` proves the pipeline against the shared goldens, but only the
**var-doc** artifact is gated today; `registry`/`plan`/`trace` need per-bundle
step fixtures that only exist once an author API (the facade) can register
steps. So the facade is both the public authoring surface **and** the host of
the remaining conformance gates — the same coupling Java uses (its `var` module
owns those gates). Everything below the adapter is proven by reproducing goldens
byte-for-byte; the adapter is proven by dogfooding the bundles against
`trace.json` and a drift fixture.

## Crates (target)

```
rust/
  var-core/        # done
  var/             # facade: authoring API + registry/plan/trace conformance harness
  var-config/      # var.config.json reader (own conformance corpus)
  var-runner/      # discovery, load-steps, plan/run, render, filesystem BaselineStore
  var-cargotest/   # libtest-mimic adapter (ADR 0007)
```

Purity gate (mirrors the Python `lint_no_reexports`/`grep` gate): `var-core`
must not depend on `var`/`var-runner`; the adapter must contain no pipeline
logic. Enforce with a `cargo-deny`/grep check in `make rust`.

### `var` facade

- Re-exports the authoring surface over `var-core::registry`: `create_registry`,
  `add_step`, `define_parameter_type[_with_format]`, `Handler::sync{0,1,2}`/`async0`,
  `Value`, `StepKind`. The **injected-Registrar** pattern (ADR 0006) — no global
  accumulator; `build_registry` chains `register(Registry) -> Registry` fns.
- **Conformance harness** (the deferred gates): for each of the 15 bundles, load
  its `*.steps.rs` fixture, then assert byte-for-byte:
  - `registry.json` via `to_registry_artifact`,
  - `plan.json` via `to_plan_artifact`,
  - `trace.json` via `run_conformance` (executor events projected inline).
  All three projections already live in `var-core::conformance`; the gate + the
  fixtures are new.
- **Fixtures:** author `conformance/bundles/<n>/*.steps.rs` for all 15 bundles,
  registering the same expressions + deterministic handlers as the `.steps.ts`.
  Serialize step-def files by stem (`numerals.steps`) so goldens stay shared.

### `var-config`

- Strict, fail-loud reader of the canonical `{ docs: {include, exclude}, steps,
  snippets, scannerPlugins }` shape. Missing file → empty; malformed/unknown-key
  → error starting with the path.
- **Done = reproduces `conformance/config/cases/*` (8 cases) byte-for-byte**
  (`golden.json` via `var-core`'s canonical JSON, or the `expect-error.txt`
  marker → load must error).

### `var-runner`

- `find_specs`/`match_spec` with the hand-rolled `glob_to_regex` (`**`, `*`, `?`,
  `../`) matching the other runners — **not** a platform glob.
- `load_steps` (chains the facade `register` fns for the workspace), `plan_spec`,
  `run_spec` (returns per-example run thunks), `render_failure` (reuses core
  diff payloads).
- Filesystem `BaselineStore` (`var.lock.json` read/write) + `reconcile_drift`
  (core owns the format + `stringify_var_lock`/`parse_var_lock`).

### `var-cargotest` adapter

Per ADR 0007: `libtest-mimic`, enumerate in `main`, per-example `Trial` closures
capturing only `(spec_path, index)` and re-deriving thread-locally; drift as
extra `Trial`s with `--var-update`/`VAR_UPDATE`.

## Non-goals (this sub-project)

- Snippet/step-def generation (deferred, per skill).
- A `var` CLI (`var init`) — TS/Python only; not on the core/runner/adapter path.
- The **tree-sitter dialect** and **repo/release integration** (languages.json,
  website tabs, crates.io publish, cliff/lint-commits scope) are tracked in the
  [completion plan](../plans/2026-07-12-rust-port-completion.md) but are not part
  of the runtime design above.
