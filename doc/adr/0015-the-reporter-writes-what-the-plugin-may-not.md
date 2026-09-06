# ADR 0015 — The vitest reporter writes what the plugin may not

- **Status:** Accepted — implemented (2026-09-06)
- **Date:** 2026-09-06
- **Deciders:** Aslak Hellesøy
- **Tags:** typescript, vitest, drift, adapter, run-result
- **Supersedes:** the "writer vs read-only gate" refinement in
  [ADR 0002](0002-drift-detection-and-acknowledgment.md)

## Context

ADR 0002 records drift detection and its acknowledgment path, with one
refinement noted during implementation:

> **Writer vs read-only gate.** `var run` (and the Python/JVM test runners,
> which have no separate CLI) is the writer that records/accepts; vitest is a
> read-only gate.

That asymmetry made TypeScript the only port of seven whose baseline could not
be recorded by running the test suite. It also made `varar run` structurally
load-bearing: `conformance/adapter/projects.json` carried a whole `baseline`
mode — `gate` — whose only user was `examples/typescript-vitest`, and the
adapter smoke contract skipped two of its six checks there as a result.

The reasoning behind the gate was sound but incomplete. `@varar/vitest` is two
pieces, and only one of them was considered:

- The **plugin** is a build-time Vite transform. It runs once per oath, in
  parallel, and again on every watch-mode change. A single shared file —
  `varar.lock.json` — is exactly what such a hook must not write.
- The **reporter** runs in the main process, once, after every test has
  finished. That is not merely an acceptable place to write the baseline; it is
  the *same* place pytest, JUnit, RSpec, `cargo test` and vstest already write
  theirs.

## Decision

**The reporter records `varar.lock.json`. The plugin still never writes.**

Drift *detection* stays where every other port does it — at collection, in the
worker, against the **runtime** plan built from the real registry. Only the
write crosses to the main process:

1. `collectVararExamples` (worker) plans the oath, detects drift against the
   baseline the plugin inlined, and reports each drift as a failing test.
2. On a clean run — or any run with `VARAR_UPDATE=1`, which accepts all drift —
   it derives the new baseline and parks it on the oath module's **file-level
   task meta**. An unacknowledged drift parks nothing, so the committed entry
   stands and the run stays red.
3. `VararResultsReporter.onTestRunEnd` (main process) collects those, folds them
   into the lock in one write, and prunes entries the `docs` globs no longer
   match.

Consequences that follow:

- `VARAR_UPDATE=1 pnpm vitest run` is the whole acknowledgment command for a
  vitest project, as it already was everywhere else.
- Every adapter reconciles. The `gate` baseline mode, its branches in
  `conformance/adapter/smoke.sh`, and its documentation are deleted, and
  `examples/typescript-vitest` runs the same six checks as the other eleven
  sample projects.
- `varar run` loses its last structural justification and is removed; the CLI is
  `init` + `lint`.

## Why not the alternatives

**Derive the baseline from the run records.** Tempting — the reporter already
collects an `ExampleResult` per example carrying `name` and `lines`, and a
baseline entry is `{ name, line }`. It is wrong, and the dogfood project proves
it: of twelve examples, two disagree, both **header-bound tables**. The baseline
holds one entry per example *candidate* (the binding paragraph); the run holds
one result per table *row*. The two artifacts describe the document at different
granularities on purpose. A baseline derived from run records would silently
rewrite every header-bound oath's entry and destroy its drift coverage — while
passing on every oath that has no such table.

**Re-plan in the reporter.** `loadSteps` + `planOath` in the main process, as
`varar run` did. Correct, but it loads every step file a second time, after the
workers already loaded them, and re-runs any module-level side effect in a
different process.

**Derive it in the plugin, from the static plan.** The plugin does hold a plan —
the tree-sitter one `discoverStaticExamples` builds to generate the test tree —
and handing that to the reporter needs no worker round trip. Rejected because
the lock file is a *committed, human-diffed* artifact: recording it from a
statically-scanned registry would make TypeScript the only port whose baseline
comes from something other than the registry the tests actually ran against.
Tree-sitter's job stays what it was — build-time test-tree generation, with the
stale-transform guard as its backstop.

## Consequences

- One more channel between worker and main process to keep honest: the
  file-meta key. It is per file rather than per test on purpose — the baseline
  lists every example, so attaching it to each test would make the payload
  quadratic in a header-bound table's row count.
- A filtered run (`vitest run varar/library.md`) re-records only the oaths that
  ran; entries for the rest are carried over untouched, and pruning is keyed off
  the `docs` globs rather than what ran. Both are covered by tests.
- A workspace root whose `docs` globs reach into a nested project would write a
  second, inert lock. `VararResultsReporter` therefore takes `writeBaseline`,
  and this repo's own root config sets it to `false`.
