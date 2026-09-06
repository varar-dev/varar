# Remove `varar run` from the TypeScript CLI

Migration plan for deleting the standalone runner, leaving `varar` as
`init` + `lint`. Status: planned 2026-09-06. Branch: `plan/remove-cli-run`.

## Why

Every modern TypeScript project already has a test runner — vitest, jest,
mocha. Shipping a second one is what made Cucumber-js clunky to run: a bespoke
CLI with its own filtering, its own reporters, its own failure formatting, none
of it composing with the runner the project already uses.

Varar's other six ports never had this problem. Python runs oaths through
pytest or unittest, Ruby through RSpec or Minitest, the JVM through JUnit or
Kotest, Rust through `cargo test`, .NET through `dotnet test`, Go through
`go test`. Only TypeScript ships a parallel path, and only because it was the
first port and the CLI came before the vitest adapter.

Removing it makes the TypeScript port structurally identical to the rest: an
adapter that plugs into the runner you already have.

## What `varar run` does today

Three jobs, and only the first is obviously replaceable:

1. **Runs oaths without a test framework** — the CLI's stated pitch
   (`bin.ts:26`, "run markdown oath examples (no test runner)"). What
   `varar init` scaffolds you into.
2. **Writes `varar.lock.json`** — the drift baseline. It is the *only* writer in
   the TypeScript port. `conformance/adapter/projects.json` marks
   `examples/typescript-vitest` as the only `baseline: "gate"` project of
   twelve for exactly this reason.
3. **Writes `.varar/<oath>.json`** run records — since `f6f497ab`. Also written
   by the vitest reporter, through the same `@varar/runner` writer, so this job
   is already redundant.

Job 2 is the blocker. Everything else in this plan is mechanical.

## The blocker, and why it is smaller than it looks

`projects.json` records the rationale for the read-only gate:

> `gate` — read-only; the file is written by `varar run` (@varar/vitest, whose
> plugin is a build-time transform and must not write during it)

That is half true. The **plugin** is a build-time transform and must not write
— it runs per file, in parallel, and again on every watch-mode change. But
`@varar/vitest` also ships a **reporter**, whose `onTestRunEnd` hook already
writes `.varar/<oath>.json` after every run. End-of-run is exactly when pytest,
JUnit, RSpec, cargo and vstest write their baselines.

So the baseline writer moves from the CLI into the reporter, and
`VARAR_UPDATE=1 pnpm vitest run` becomes the acknowledgement command — the same
one every other port already uses. `runtime.ts:60` already skips the drift
diagnostic when `VARAR_UPDATE` is set, so the accept path goes green *and*
re-records in one run, which is what smoke steps 4 and 5 require.

**Consequence:** `baseline: "gate"` loses its only user. That mode, its branch in
`smoke.sh`, and its documentation can be deleted. The adapter contract gets
simpler, not more complex.

## How the reporter gets what `reconcileDrift` needs

`reconcileDrift({ store, oathPath, source, doc, plan, update })` needs the parsed
`doc` and the `plan` — the plan because "live example" means "matches a step",
which requires the registry. The reporter has `cwd` and can read the source, but
has neither `doc` nor `plan`.

### Rejected: derive the baseline from the run records

Tempting, since the reporter already collects `ExampleResult[]` carrying `name`
and `lines` — and a baseline entry is `{ name, line }`. It does not work, and
the dogfood project proves it. Comparing all 12 baseline entries against the run
records:

```
total examples: 12
line mismatches (baseline vs record): 2
   varar/roman-numerals.md  'Each row gives an example of a decimal a…'  line 3  → no record
   varar/yahtzee.md         'Examples of dice, category and score:'      line 7  → no record
```

Both are **header-bound tables**. The baseline holds one entry per example
candidate — the binding paragraph at line 3 — while the run holds one
`ExampleResult` per table *row* (`3 / III` at line 7, `4 / IV` at line 8, ten in
all). The two artifacts describe the document at different granularities, on
purpose. A baseline derived from run records would silently rewrite every
header-bound oath's entry and destroy its drift coverage.

This is the single most dangerous idea in this plan. It looks correct, passes on
every oath without a header-bound table, and quietly breaks the two that have
one.

### Option A — the reporter re-plans

`loadSteps(cfg.steps, cwd)` + `planOath(path, source, registry)` in the reporter,
exactly as `cli/src/run.ts` does today.

- **For:** identical to the current writer, so the recorded bytes cannot drift;
  no new plumbing; the code moves rather than changes.
- **Against:** loads every step file a second time, in the main process, after
  the workers already loaded them. Slower on large suites, and any module-level
  side effect in a steps file runs again in a different process.

### Option B — the plugin hands `liveExamples` to the reporter (recommended)

The plugin already has `doc` and `plan` at transform time (it generates one test
per planned example from them). It computes `liveExamples(doc, plan)` and stashes
the result in a module-scoped map keyed by oath path; the reporter reads that map
at end of run and writes the baseline.

Plugin and reporter are both instantiated from `vitest.config.ts`, in the same
main process and the same module graph, so this is an in-memory handoff — no
serialization, no re-planning, no writing during transform.

- **For:** no second step load; the baseline is computed from exactly the plan
  the tests were generated from.
- **Against:** new shared state between two files in `@varar/vitest`. Must be
  keyed per oath and cleared per run, or watch mode accumulates stale entries.
  Needs a test that a filtered run (`vitest run varar/library.md`) writes only
  the oaths that ran.

**Recommendation: B**, with A as the fallback if the shared-map lifetime proves
awkward under watch mode. Decide by writing B's test for watch mode first.

### Pruning

`pruneBaselines` needs only the configured oath list, not the registry — the
reporter can call `loadConfig(cwd)` + `findFiles` itself. No design question
here, but it must key off `varar.config.json`, **not** the oaths that ran, or a
filtered run deletes live baselines (`drift.ts:204`).

## Phases

Each phase leaves trunk green and releasable.

### Phase 1 — the reporter becomes the baseline writer

`varar run` still exists and still works; it is simply no longer the only
writer. Independently valuable even if the rest of this plan is never done.

- Move `reconcileDrift` + `pruneBaselines` into `@varar/vitest`'s reporter
  (Option B above).
- Flip `examples/typescript-vitest` to `baseline: "reconcile"` in
  `conformance/adapter/projects.json`.
- Delete the `gate` branch from `conformance/adapter/smoke.sh` and its
  description in `projects.json`'s `$comment`.
- Verify: `conformance/adapter/smoke.sh examples/typescript-vitest` passes all
  six checks, including `drift-accepted (baseline re-recorded)` — which the
  project has never run before, because it was a gate.

### Phase 2 — decide what `varar init` scaffolds

The riskiest change, because it is a UX decision rather than an edit.

`init` currently writes `varar.config.json`, an oath, a steps file, and
`"type": "module"` — a project that runs immediately with `varar run`. Without
`run` that scaffold **cannot run anything**. Options:

- **B1:** `init` also writes `vitest.config.ts` (plugin + `VararResultsReporter`)
  and adds `vitest` + `@varar/vitest` to devDependencies. One command still gets
  a runnable project; `init` grows a dependency on the vitest adapter.
- **B2:** `init` stays as is and prints the two extra steps. Matches the other
  ports (`uv add --dev pytest-varar`, then `uv run pytest`), keeps `init`
  adapter-agnostic — jest and mocha adapters would arrive later — but the
  tutorial gains two steps.

**Recommendation: B1**, because "install, configure, run, watch it fail" is the
tutorial's promise and B2 makes the TypeScript path the longest of the seven
rather than the shortest. Revisit if a second TypeScript adapter ever ships.

### Phase 3 — delete the command

- `typescript/packages/cli/src/run.ts` (149 lines)
- `typescript/packages/cli/tests/run.test.ts` (92 lines, 3 tests)
- `bin.ts`: the `run` case and its two help lines
- `examples/typescript-vitest/package.json`: the `"varar": "varar run"` script

**Then chase the dead exports.** `run.ts` is the only consumer outside their own
tests of:

| Export | Package | After removal |
|---|---|---|
| `renderFailure` | `@varar/runner` | no consumer — vitest formats its own failures. Delete `render.ts` and its tests |
| `createFileBaselineStore` | `@varar/runner` | re-imported by the reporter (Phase 1) |
| `reconcileDrift`, `pruneBaselines` | `@varar/core` | re-imported by the reporter (Phase 1) |

`pnpm knip` fails the build on unused exports, so this is enforced rather than
remembered.

Coverage will *improve*: `run.ts` sits at 46% branch coverage, and the global
branch threshold (69%) currently passes by 0.98 points.

### Phase 4 — documentation

15 locations. `languages.json` is the leveraged one: `ts.run` drives every
`<LangCommand kind="run">` tab, so get-started fixes itself.

| File | What changes |
|---|---|
| `languages.json:24` | `ts.run` → `pnpm vitest run` |
| `tutorials/first-oath.mdx:66` | `pnpm exec varar run` |
| `how-to/run-with-vitest.md:89` | `npx varar run --update` → `VARAR_UPDATE=1 pnpm vitest run` |
| `reference/examples.mdx:298,310,320,337` | drift section + the "how to accept" table |
| `reference/run-results.mdx:32,210` | producers list, acknowledgement line |
| `reference/lint.md:8` | "the same registry `varar run` uses" |
| `packages/cli/README.md:3` | command list |
| `examples/typescript-vitest/README.md:44` | the ESM-resolver caveat, which is about `varar run` |
| `doc/ARCHITECTURE.md:34` | the "Powers" table |
| `TODO.md:69,100` | Phase-2 polish item; the standalone-runner benchmark |
| `drafts/install-var.md` ×3 | draft page, not published |
| `typescript/packages/vitest/src/runtime.ts:28,60` | comments naming `varar run` as the writer |
| `typescript/packages/cli/src/lint.ts:30,38` | comments |
| `typescript/packages/core/src/drift.ts:204` | comment citing `varar run --globs` |
| `python/packages/runner/src/varar_runner/cli.py:6` | comment; stays accurate, reword for clarity |

**Plus an ADR.** `doc/adr/0002-drift-detection-and-acknowledgment.md:14` states
the design as *"Writer vs read-only gate: `var run` is the writer, vitest is a
read-only gate."* That distinction disappears. Either amend 0002 with a
superseded-by note or write a short ADR recording why the reporter may write
what the plugin may not — the reasoning is subtle enough to be worth its own
page.

## What is genuinely lost

1. **Running oaths with no test framework at all.** The "no test runner" pitch
   goes. This is the point of the change, not a side effect.
2. **`varar run --globs`** ad-hoc filtering. Vitest's own file filtering covers
   it, but the plugin drives `include`/`exclude` from `varar.config.json`, so the
   ergonomics differ — worth a line in the vitest how-to.
3. **The standalone benchmark story** (`TODO.md:100`: the CLI runner at ~2× a
   Cucumber sample). Irrelevant under the new pitch.
4. **A two-step TypeScript tutorial.** Mitigated by Phase 2 option B1.

## Risks

- **Baseline bytes must not change.** The lock file is committed and diffed by
  humans; a reordered or re-lined entry looks like drift. Verify by running the
  new writer against the dogfood project and requiring `git diff
  examples/typescript-vitest/varar.lock.json` to be empty — the smoke contract's
  `drift-accepted` check already asserts exactly this, byte for byte.
- **Watch mode.** Option B's shared map must not leak between runs. Untested
  today because the CLI never ran in watch mode.
- **Filtered runs.** `vitest run varar/library.md` must re-record only that oath
  and prune nothing. `drift.ts:204` already warns about this for `--globs`; the
  same hazard moves to vitest's filtering.
- **Third-party adapters.** Anyone with a jest or mocha adapter loses the CLI
  fallback. No such adapter exists today; note it in the release notes if one
  appears before this lands.

## Verification checklist

- [ ] `conformance/adapter/smoke.sh examples/typescript-vitest` — all six checks,
      with `baseline: "reconcile"`
- [ ] `git diff examples/typescript-vitest/varar.lock.json` empty after a
      `VARAR_UPDATE=1` run
- [ ] a filtered `vitest run <one oath>` leaves the other oaths' baselines and
      records untouched
- [ ] watch mode: two consecutive runs write identical baselines
- [ ] `pnpm knip` clean (dead exports chased)
- [ ] `pnpm check` coverage thresholds still met
- [ ] `make check` green across all seven ports
- [ ] `varar init` output runs on a clean machine (Phase 2 acceptance)
- [ ] the get-started tutorial's TypeScript tab, followed verbatim, ends with a
      passing oath and then a deliberate failure
