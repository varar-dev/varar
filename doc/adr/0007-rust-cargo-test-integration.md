# ADR 0007 — Rust cargo test integration via `libtest-mimic`

- **Status:** Proposed
- **Date:** 2026-07-12
- **Deciders:** Andreas Koestler
- **Tags:** rust, cargo, libtest, test-runner-adapter, cross-language

## Context

Rust is a full pipeline port ([ADR 0006](0006-rust-port.md)). Like every other
port, its test-framework adapter must give **one independently
selectable/reportable test per Markdown example**, with failures rendered
anchored to the `.md` source span, and a drift gate (ADR 0002). The "framework"
in Rust is `cargo test` over the built-in libtest harness.

The obstacle is specific to Rust. libtest's `#[test]` set is **fixed at compile
time**, but var's examples are **data-driven** — a header-bound table expands to
one example per row, known only after parsing the `.md` at runtime. So the
standard attribute macro cannot express the test set.

Worse, `var-core` is deliberately **single-threaded**: handlers are `Rc<dyn Fn>`
closures and the threaded state is `Rc`-shared, so a planned example is **not
`Send`**. libtest (and `libtest-mimic`) require each test body to be
`FnOnce() + Send + 'static`, because the default runner moves each test to its
own thread. A closure that captures a planned example cannot cross that bound.

### Options considered

**A. `build.rs` code generation.** Parse every oath at build time and emit one
`#[test] fn` per example into `OUT_DIR`. Gives real `#[test]`s and native IDE
selection, but adds a build-dependency on `var-core` + the facade, regenerates
on every oath edit, and duplicates the parse (build time *and* run time). Heavy.

**B. Custom `harness = false` binary with a hand-rolled reporter.** Full control,
single process, no `Send` needed — but reimplements everything `cargo test`
already gives (filter args, `--list`, `--nocapture`, output format, exit codes).

**C. Make `var-core` `Send`** (`Rc`→`Arc`, `Send` closures) so `libtest-mimic`'s
threaded runner works unchanged. Rejected: invasive to the proven, deliberately
single-threaded core, for no user benefit.

**D. `libtest-mimic`, keeping all `Rc` state thread-local.** `libtest-mimic` is
the community crate for exactly this shape — build a `Vec<Trial>` at runtime and
hand it to a `harness = false` binary; `cargo test` then reports, filters, and
lists each `Trial` like a native test. The `Send` bound is satisfied by making
each `Trial` closure capture **only owned `Send` data** — the oath path plus the
example's index — and **re-derive its single example inside the closure**
(re-read the file, rebuild the registry, re-parse, re-plan, run just that
example). No `Rc` value ever crosses the thread boundary, so `var-core` stays
untouched. Enumeration (names, counts, `.md` line) happens once in `main` on the
main thread, where `Rc` is fine.

## Decision

Adopt **option D**: the adapter crate (`var-cargotest`) is a `harness = false`
library that exposes a `main`-style entry the sample's `tests/oaths.rs` calls.
It:

- reads `var.config.json` (via `var-config`) and globs the oaths (via
  `var-runner`), then parses/plans each once to **enumerate** examples — one
  `Trial` per example, named by the pytest/unittest display rule (innermost
  heading or body-derived name, de-duplicated with `[n]`), located at the `.md`
  line;
- gives each `Trial` a closure capturing only `(oath_path, example_index)` as
  owned data; the closure re-derives and runs that one example through
  `var-runner`, mapping a `StepFailure` to `libtest_mimic::Failed` with the
  core's `.md`-anchored render;
- emits the **drift** reconciliation as additional failing `Trial`s (one per
  drifted paragraph), honouring `--var-update` / `VAR_UPDATE` (ADR 0002);
- delegates **all** pipeline/rendering logic to `var-runner`/`var-core` — the
  adapter owns only the libtest binding.

The current `examples/rust-cargotest` uses a stopgap (one plain `#[test]` per
oath file, printing per-example lines) precisely because it predates this
decision and could not satisfy `Send`. Phase 5 of the completion plan refactors
it onto this adapter.

## Consequences

- Real `cargo test` UX: `cargo test <substring>` selects examples, `--list`
  enumerates them, `--nocapture` shows output — no bespoke CLI.
- Per-example re-parse/re-plan inside each `Trial` is redundant work, but cheap
  at corpus scale and the price of keeping `var-core` single-threaded.
- Adds a `libtest-mimic` dependency to the adapter (and thus the sample); the
  core and runner stay dependency-light.
- `.md`-line location is set on the `Trial`; libtest cannot point a failure at an
  arbitrary source file the way JUnit's `TestSource` can, so the anchored span
  also travels in the rendered failure message (as it already does).
