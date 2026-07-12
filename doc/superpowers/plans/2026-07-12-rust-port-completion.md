# Rust port completion — task plan

**REQUIRED SUB-SKILL:** superpowers:executing-plans or
superpowers:subagent-driven-development. Load the
[`adding-a-language-port`](../../../.claude/skills/adding-a-language-port/SKILL.md)
skill.

Design: [`2026-07-12-rust-facade-runner-adapter-design.md`](../specs/2026-07-12-rust-facade-runner-adapter-design.md).
ADRs: [0006](../../adr/0006-rust-port.md) (port), [0007](../../adr/0007-rust-cargo-test-integration.md) (cargo adapter).

## Goal

Bring the Rust port from "`var-core` + var-doc gate + a standalone sample" to a
**complete port**: all four conformance artifacts × 15 bundles + the config
corpus green, the full crate shape (`var`, `var-config`, `var-runner`,
`var-cargotest`), a tree-sitter dialect, and repo/release integration — the
sample refactored onto the shipped crates.

## Done already

- `var-core` (pipeline + diffs + drift/hash + conformance projections); **var-doc**
  golden gate over 15 bundles; 209 tests.
- `examples/rust-cargotest` (stopgap inline runner) matching the Python samples
  byte-for-byte; `make rust` + `.github/workflows/rust.yml` run it;
  `examples/README.md` row; inert crates.io pin block in `70-var-examples.sh`.

## Global constraints

- **Translate, don't redesign** — the TS module + its `*.test.ts` are the spec.
- Every core module is proven by **reproducing shared goldens byte-for-byte**;
  drift is the one unit-gated feature. Never hand-write new conformance tests.
- Adapters/runner contain **no pipeline logic** — delegate to `var-core`.
- Purity: `var-core` imports nothing from `var`/`var-runner` (grep gate).
- Each task ends green + `cargo fmt --check` + `cargo clippy -D warnings` + one commit.
- Commits: `chore(rust)`/`docs(rust)`/`test(...)` until the crates.io release
  target lands (Phase 7); only then may `feat(rust/<crate>)` be used.

## Dependency order

`P0` → {`P1`, `P2`, `P6`} → `P3` → `P4` → `P5` → `P7` → `P8`.
`P2` (config) and `P6` (tree-sitter, TS-side) are independent — schedule anytime.

---

### P0 — Decisions + docs — DONE in this change
ADR 0006, ADR 0007, the design spec, and this plan. No code.

### P1 — `var` facade + the three deferred golden gates (L)
1. `rust/var` crate skeleton; re-export the authoring surface; `build_registry`
   chaining injected `register(Registry)` fns. Purity grep gate.
2. Author `conformance/bundles/<n>/*.steps.rs` for all 15 bundles (same
   expressions + deterministic handlers as `.steps.ts`; step files serialized by
   stem). **Test-first: wire the gate red, then fill fixtures.**
3. `registry.json` gate byte-for-byte over 15 bundles (`to_registry_artifact`).
4. `plan.json` gate (`to_plan_artifact`).
5. `trace.json` gate (`run_conformance`).
   Each of 3–5 is its own green commit. Exit: 4/4 artifacts × 15 bundles.

### P2 — `var-config` (S/M)
1. Reader for `{docs:{include,exclude}, steps, snippets, scannerPlugins}`;
   strict/fail-loud.
2. Reproduce `conformance/config/cases/*` (8) byte-for-byte (golden / expect-error).

### P3 — `var-runner` (M)
1. `glob_to_regex` + `find_specs`/`match_spec` (port the shared semantics).
2. `load_steps`, `plan_spec`, `run_spec`, `render_failure`.
3. Filesystem `BaselineStore` + `reconcile_drift`; port `hash`/`drift` unit tests
   (already in core — re-use) and add a runner-level drift test.

### P4 — `var-cargotest` adapter (M/L) — ADR 0007
1. `harness = false` crate; enumerate examples in `main`; one `Trial` per example
   (display-name rule; `.md` line), closures capturing only `(spec_path, index)`.
2. Failure → `.md`-anchored render; drift `Trial`s + `--var-update`/`VAR_UPDATE`.
3. Dogfood: run the conformance bundles through the adapter, assert against
   `trace.json`; add a `var.lock.json` drift fixture test.

### P5 — Refactor the sample onto the crates (S)
Point `examples/rust-cargotest` at `var` + `var-cargotest`; delete `src/runner.rs`
and the inline config reader. Behaviour unchanged (still 30 examples, byte-for-byte
vs Python).

### P6 — Tree-sitter dialect (M) — independent, TS-side
1. `var-language/src/tree-sitter-dialects/rust.ts` (`LanguageSpec`: step-def +
   param-type queries, `decodeString`, `extractHandlerParams`, `resolveRegexp`),
   queries verified against the real grammar.
2. Wire: `tree-sitter-scanner.ts` (SPECS/EXTENSIONS/`LanguageId`), both grammar
   loaders (`var-lsp`, `var-language` test loader), VS Code bundler copy list,
   both `knip.json` ignore blocks.
3. Prove: `extraction-conformance.test.ts` (identical `(kind, expression)` /
   `(name, regexp)` sets as TS on every `*.steps.rs`) + `tree-sitter-scanner-rust.test.ts`.
   Exit: `language-coverage.test.ts` green.

### P7 — Repo + release integration (M)
1. `languages.json`: `rust` entry (label, icon, `ext=.rs`, stepsGlob,
   `hasCli:false`, install/scaffold/run) + add id to the `SiteLang` union.
2. Website docs: `<TabItem label="Rust">` across `reference/*`, `how-to/*`, and
   the get-started tabs.
3. `release/targets/NN-crates-io.sh` publish target + add Rust to the release
   channels → the `70-var-examples.sh` pin block goes live.
4. `release/lint-commits.sh` consumer-scope regex + message: add `rust`;
   `cliff.toml`: add the crates.io/Rust changelog section.
5. `make rust` + CI: build/test all crates, run all four gates + the config corpus.

### P8 — Full-port verify (S)
4 artifacts × 15 bundles + config corpus 8/8 byte-for-byte; `language-coverage`
green; sample on real crates green; `make rust` + `rust.yml` green. Update the
[`adding-a-language-port`](../../../.claude/skills/adding-a-language-port/SKILL.md)
status line to list Rust as complete.

## Risks

- **cucumber-expressions `0.5` (community) vs pinned `20.0.0`** — divergence
  surfaces first at P1's registry/plan gates; those are the acceptance test.
  Confirm no bundle needs `{float}` or regex lookahead.
- **`Rc`/`Send`** — settled by ADR 0007 (thread-local re-derive); revisit only if
  a bundle proves it insufficient.
- **crates.io name availability** (`var-core`, `var`, `var-config`, `var-runner`,
  `var-cargotest`) — check before P7.
