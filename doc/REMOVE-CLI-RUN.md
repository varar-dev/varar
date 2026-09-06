# Remove `varar run` from the TypeScript CLI

Migration plan for deleting the standalone runner, leaving `varar` as
`init` + `lint`.

**Status: done (2026-09-06).** All four phases landed on `plan/remove-cli-run`.
The one design question left open — where the reporter's baseline comes from —
was settled in favour of the **runtime** plan, shipped from the worker on
file-level task meta; see
[ADR 0015](adr/0015-the-reporter-writes-what-the-plugin-may-not.md) for the
reasoning and the alternatives. Kept as the record of why.

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

### Phase 2 — `varar init` scaffolds the test-runner config

**Decided:** `init` writes `vitest.config.ts` — or edits an existing one — and
adds `vitest` + `@varar/vitest` to devDependencies, so one command still leaves a
runnable project. Without this the scaffold **cannot run anything**, and the
TypeScript tutorial would go from the shortest first five minutes of the seven
ports to the longest.

The runner is a *choice*, not a constant. Jest is the obvious second, and the
design must not have to be unpicked when `@varar/jest` ships.

#### Choosing the runner

```
varar init                     # auto-detect, default vitest
varar init --runner vitest     # explicit
varar init --runner jest       # explicit
```

Auto-detection, first match wins:

1. an existing runner config in `cwd` — `vitest.config.{ts,js,mts,mjs}`,
   `jest.config.{ts,js,mjs,cjs}`, or a `jest` key in `package.json`;
2. `package.json` devDependencies — `vitest`, then `jest`;
3. the `package.json` `test` script, if it names one;
4. otherwise **vitest**.

Detection reports what it picked and why (`detected vitest (vitest.config.ts)`),
because a wrong guess writes files. `--runner` always wins over detection.

Until `@varar/jest` exists, `--runner jest` must fail with "no Jest adapter yet"
and a link, **not** scaffold something that cannot work. Detecting jest in a
project with no adapter available is the same message.

#### Shape of the implementation

Table-driven, one entry per runner — config filename, the snippet to write, the
devDependencies to add, and the "already wired?" probe. Adding jest later is a
new row plus its adapter package, not a rewrite of `init`. Nothing outside that
table may name a runner.

#### Editing an existing config

Writing a fresh `vitest.config.ts` is trivial. Editing one is where this gets
dangerous: it is TypeScript, not JSON, so there is no safe general edit, and
`init`'s existing contract is *never clobber* (it skips every file that already
exists, and even declines to touch a `package.json` whose `type` is something
unexpected).

Rules, in order:

1. **Already wired** — the file mentions `@varar/vitest`: report
   `skipped vitest.config.ts (already configured)` and do nothing.
2. **Recognisable and unwired** — a single `defineConfig({ … })` call with no
   `@varar/vitest` import: insert the import, add the plugin to `plugins`, and
   add `VararResultsReporter` to `test.reporters` (creating either key if
   absent). Re-read and parse the result to confirm it still parses; restore the
   original and fall through to (3) if it does not.
3. **Anything else** — an exported variable, a conditional config, a merge
   helper: leave the file alone, print the exact snippet to paste, and say which
   file to paste it into. Exit 0; this is a scaffold, not a migration tool.

Case (3) is the honest default, and case (2) should stay narrow. A config
mangled by a clever regex is worse than a printed snippet.

`.gitignore` gets `.varar/` if it exists and lacks it — the run records are
artifacts, and every sample project already ignores them.

#### Acceptance

- `varar init` in an empty directory, then `pnpm install && pnpm vitest run`,
  passes with no manual edits (this is the tutorial, verbatim).
- `varar init` twice in a row is a no-op the second time — every file reports
  `skipped`.
- `varar init` in a project with a hand-written `vitest.config.ts` that already
  has plugins does not corrupt it: either case (2) leaves a file that parses and
  runs, or case (3) leaves it byte-identical.
- `--runner jest` exits non-zero with the "no adapter yet" message.

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
4. **A two-step TypeScript tutorial.** Mitigated by Phase 2: `varar init` leaves
   a runnable project, so the tutorial keeps its shape — install, configure,
   run, watch it fail.

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
- **`init` editing a config it did not write.** Phase 2 case (2) is the only
  place this plan touches a file the user authored. Keep the recognised shape
  narrow, verify the result parses, and prefer printing a snippet — a corrupted
  `vitest.config.ts` is a worse first five minutes than a manual paste.
- **The runner table is the extension point.** If jest support arrives by
  special-casing inside `init` rather than by adding a row, the door this plan
  deliberately left open closes again.

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
- [ ] `varar init` output runs on a clean machine, unedited (Phase 2 acceptance)
- [ ] `varar init` is idempotent, and leaves a hand-written `vitest.config.ts`
      either correctly wired or byte-identical
- [ ] `varar init --runner jest` fails with the "no adapter yet" message
- [ ] adding a runner means adding a table row — nothing outside it names a
      runner
- [ ] the get-started tutorial's TypeScript tab, followed verbatim, ends with a
      passing oath and then a deliberate failure
