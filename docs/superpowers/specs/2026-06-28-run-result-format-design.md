# Run-result format + pure hash + vitest reporter

Date: 2026-06-28
Status: design, pending implementation (TDD).

Sub-project #1 of the shared run-result work. Builds on the return-comparison
core ([cell-diff](2026-06-28-cell-diff-design.md),
[table & doc-string](2026-06-28-table-docstring-return-comparison-design.md))
and the editor rendering
([phase 2b](2026-06-28-phase-2b-editor-cell-rendering-design.md)).

## Why

The core already fails a mismatch with structured, span-anchored data
(`CellMismatchError.cells: CellDiff[]`, `DocStringMismatchError.diff`). The
website's in-browser runner turns that into a small in-memory shape
(`packages/website/src/lib/run-types.ts`: `RunResults` / `ExampleResult` /
`CellFailure`) that CodeMirror renders as red cells + hover-actual.

That shape is, in miniature, a **var-specific run-result format**. This
sub-project promotes it into the core as the canonical, serializable type and
gives it a producer beyond the browser: a vitest reporter that writes
`.var/<spec>.json` after a run. A persisted, span-anchored result file is the
spine that later lets the LSP show the same red+hover in VSCode (sub-project #2)
and a `<script src="var.js">` overlay highlight rendered HTML (sub-project #3).

## Scope

In:

1. A shared run-result format in `@oselvar/var` (pure, serializable, immutable).
2. A pure, dependency-free source hash (`hashSource`) in `@oselvar/var`.
3. Two pure helpers in `@oselvar/var`, shared by every producer:
   `failureSpans` (error → `cells`/`doc`) and `failingLine` (stack → line).
4. A custom vitest reporter in `@oselvar/var-vitest` that writes
   `.var/<mirrored-spec-path>.json`.
5. The website refactored onto the shared type + helpers as the first consumer.

Out (later sub-projects, but the format must not foreclose them):

- **LSP / VSCode red+hover** — consumes `.var/` + `sourceHash`. Sub-project #2.
- **`var.js` HTML overlay** — fetches `.var/`, overlays `ins`/`del`. #3.
- **Example-drift detection** ("this used to be an example") — a *separate*
  committed, workspace-global, fingerprint-keyed baseline; not a field in this
  ephemeral, path-keyed, git-ignored results file. Sub-project #4. Its seam is
  already present here: each `ExampleResult` carries `name` + `lines`, the raw
  material a future resilient fingerprint is computed from. **No speculative
  fields are added now.**

## File layout

One result file per spec, mirroring the spec's path under `.var/`:

```
docs/tutorial/04-yahtzee.var.md
  → .var/docs/tutorial/04-yahtzee.var.md.json
```

Rationale: most decoupled; the LSP maps an open file straight to one result
file; a partial test run only rewrites the specs it actually ran. `.var/` is
**git-ignored** (these results are ephemeral, regenerated each run).

Anything that must track examples *over time* (drift, #4) is instead
**workspace-global**, not per-file — so moving an example between specs is one
move, not a disappearance + appearance. That artifact is out of scope here; the
note is recorded so #4 does not key its baseline by path.

## Format (core, pure, serializable)

`packages/var/src/result.ts`:

```ts
export type CellFailure = {
  readonly from: number   // source offset of the EXPECTED cell text (== CodeMirror position)
  readonly to: number     // source offset, exclusive
  readonly actual: string // the runtime value the step produced
}

export type ExampleResult = {
  readonly name: string
  readonly status: 'passed' | 'failed'
  readonly lines: ReadonlyArray<number> // 1-based source lines of this example's steps
  readonly failure?: {
    readonly line: number
    readonly message: string
    readonly stack: string
    readonly cells?: ReadonlyArray<CellFailure> // table / header-bound row mismatches
    readonly doc?: CellFailure                  // doc-string body mismatch (single span)
  }
}

export type SpecResults = {
  readonly version: 1
  readonly specPath: string   // the spec path as written (POSIX separators)
  readonly sourceHash: string // hashSource(spec source) at run time
  readonly examples: ReadonlyArray<ExampleResult>
}
```

`ExampleResult` / `CellFailure` are exactly today's website shapes, moved into
the core verbatim so the website imports rather than redeclares them.
`SpecResults` wraps them with `version`, `specPath`, and `sourceHash` — the
persisted file *is* a `SpecResults`.

`version` is the format version (literal `1`); consumers reject what they don't
understand. `specPath` is stored with POSIX separators so a result written on
one OS resolves on another.

## Hash (core, pure, dependency-free)

`packages/var/src/hash.ts`:

```ts
// FNV-1a, 32-bit. No node:crypto (core never imports node:*). Deterministic and
// identical across producers/consumers: the reporter, the LSP, and var.js all
// compute the same hash from the same bytes — so staleness is exact, not
// best-effort, and language-agnostic for a future non-JS runtime.
export function hashSource(source: string): string // e.g. "fnv1a:1a2b3c4d"
```

FNV-1a is chosen over a crypto hash deliberately: this is a *change-detector*,
not a security primitive. It needs to be tiny, dependency-free, and trivially
re-implementable in another language. The `fnv1a:` prefix namespaces the
algorithm so the format can adopt a different one later without ambiguity.

### Staleness contract

Every `.var/*.json` carries the `sourceHash` of the source it was computed from.
A consumer compares it to `hashSource(currentSource)`:

- **match** → offsets are valid against the current source; render.
- **mismatch** → the file changed since the run; results are obsolete; do not
  render.

This is the persisted form of the editor's existing in-memory rule (results are
cleared on `docChanged`). It is the only invalidation mechanism; there is no
partial remap.

## Shared pure helpers (core)

The website's `run-spec.ts` already hand-rolls two pieces of logic that every
producer needs. Promote both into the core, pure, so the vitest reporter and the
browser runner stay byte-identical.

`packages/var/src/failure.ts`:

```ts
// The only part of a failure that cannot be reconstructed from a re-parse +
// the test runner's own error record: the span-anchored cells / doc. Extracted
// from the thrown step error. Returns {} for a plain Error / ReturnShapeError.
export function failureSpans(error: unknown): {
  readonly cells?: ReadonlyArray<CellFailure>
  readonly doc?: CellFailure
}

// executePlan injects a `<specPath>:line:col` frame into the stack. Recover the
// 1-based failing line from it (the website's current private failingLine()).
export function failingLine(stack: string, specPath: string): number | undefined
```

`failureSpans` behavior (mirrors today's `run-spec.ts`):

- `isCellMismatchError(error)` → `cells` = the `!ok` diffs mapped to
  `{ from: span.startOffset, to: span.endOffset, actual }` (omitted when empty).
- `isDocStringMismatchError(error)` → `doc` =
  `{ from: span.startOffset, to: span.endOffset, actual: diff.actual }`.
- any other error → `{}`.

`message`/`stack` are **not** in these helpers: vitest's own task error record
carries them (and the browser has the `Error` in hand), so each producer fills
them locally rather than threading them through `meta`.

## Producer: vitest reporter

Each Vár example already becomes one vitest `test()` (via the generated virtual
module's `sink.example`). Example tests run in **worker** processes; a vitest
reporter runs in the **main** process. Only the `cells`/`doc` spans are
un-reconstructable in the main process — they exist solely at throw time inside
the worker. They cross the boundary via vitest's `task.meta` (serialized, the
blessed channel for custom per-test data). Everything else (`name`, `lines`,
`status`, `message`, `stack`, failing `line`) the reporter rebuilds in the main
process from a re-parse of the spec plus vitest's own task tree.

### Boundary wrapper — `packages/var-vitest/src/plugin.ts`

`generateVirtualModule` wraps each example run so a thrown error's spans are
attached to the test's `task.meta`, then re-thrown (vitest still records the
failure exactly as today):

```ts
// inside the generated module, per example:
sink: {
  example: (name, run) =>
    vitestTest(name, async (ctx) => {
      try {
        await run()
      } catch (error) {
        const spans = failureSpans(error)            // imported from @oselvar/var
        if (spans.cells || spans.doc) ctx.task.meta.varResult = spans
        throw error
      }
    }),
}
```

`meta.varResult` carries only `{ cells?, doc? }`. Passing examples attach
nothing.

### Reporter — `packages/var-vitest/src/reporter.ts`

Exported as `@oselvar/var-vitest/reporter`. A Vitest `Reporter` whose
end-of-run hook (`onFinished(files)`):

1. Loads `var.config.ts` (via `loadVarConfig`, as the plugin already does) to
   get `scannerPlugins` — re-parsing must use the same plugins the run used, or
   Gherkin tables / doc strings parse differently.
2. Groups test tasks by their owning spec file (`task.file.filepath` ending in
   `.var.md`). Skips the `var:diagnostic:*` tasks the generated module emits for
   diagnostics — they are not examples.
3. For each spec file:
   - Reads the spec source from disk; computes `hashSource(source)`.
   - Re-parses + plans it (`parse` + `plan`, with the config's `scannerPlugins`)
     to recover each example's `name` and
     `lines = [...new Set(ex.steps.map((s) => s.matchSpan.startLine))]` — the
     identical derivation the website uses.
   - Matches each parsed example to its vitest task by declaration order
     (the generated module registers tests in plan order; same order the
     reporter walks the parsed examples), asserting the names agree.
   - Builds each `ExampleResult`: `status` from the task result state
     (`passed`/`failed`); on failure, `failure = { line: failingLine(stack,
     specPath) ?? lines[0] ?? 0, message, stack, ...meta.varResult }` where
     `message`/`stack` come from the task's error record and the spans come
     from `task.meta.varResult`.
   - Assembles `SpecResults` (`version: 1`, `specPath` POSIX-normalized,
     `sourceHash`, `examples`).
4. Writes `.var/<mirrored-spec-path>.json` (creating parent dirs), pretty JSON.

This is the only side-effecting code in the sub-project, and it lives in the
adapter (`var-vitest`), in the main process, as a single writer per spec — so
there is no worker write race. Users opt in by adding the reporter to their
vitest config.

> **Rejected alternative:** enrich the core `TestSink.example` port to hand the
> sink each example's `lines`/`name` so the wrapper could attach a full
> `ExampleResult` to `meta` (no re-parse). Rejected: it changes a core port for
> an adapter convenience, and `parse`/`plan` are pure and cheap. Keeping the
> reconstruction in the adapter leaves the core untouched.

## Consumer: website (refactor onto the shared type + helpers)

- Delete `packages/website/src/lib/run-types.ts`; import `SpecResults`,
  `ExampleResult`, `CellFailure` from `@oselvar/var`.
- `run-spec.ts`: replace the inline `isCellMismatchError`/
  `isDocStringMismatchError` extraction with `failureSpans(err)`, and the
  private `failingLine` with the core `failingLine`. Return a full `SpecResults`
  (`version: 1`, `specPath: varPath`, `sourceHash: hashSource(varSource)`,
  `examples`). Behavior is otherwise unchanged.
- `cm-run.ts`: behavior unchanged. The `setRunResults` effect and the fields now
  carry `SpecResults` (read `.examples` off it) — a type rename, no logic
  change.

No new rendering; this sub-project is plumbing. The visible payoff is the
`.var/` files and a single shared type.

## `.gitignore`

Add `.var/` (ephemeral, regenerated each run).

## Architecture / hexagonal check

| Piece | Package | Pure? | Notes |
|-------|---------|-------|-------|
| `SpecResults` / `ExampleResult` / `CellFailure` | `@oselvar/var` | data | serializable, immutable |
| `hashSource` | `@oselvar/var` | ✅ | no `node:*` |
| `failureSpans` / `failingLine` | `@oselvar/var` | ✅ | shared by both producers |
| boundary wrapper | `@oselvar/var-vitest` | n/a | attaches `meta`, re-throws |
| reporter (file writes) | `@oselvar/var-vitest` | ❌ (shell) | only side effects, main process |
| website runner | `@oselvar/website` | n/a | builds the shared type |

The core gains no `node:` imports and no I/O. All file writing is in the
`var-vitest` adapter.

## Testing (TDD order, pure-first)

1. **`hashSource`** (core unit): deterministic for the same input; different for
   a one-char change; output carries the `fnv1a:` prefix; a stable known-vector
   (assert a specific hash for a fixed string so a future refactor can't
   silently change the algorithm).
2. **`failureSpans`** (core unit): the matrix the website already covers, now in
   the core — a `CellMismatchError` yields `cells` with the right
   `{from,to,actual}` (offsets slice back to the expected text); a whole-table
   mismatch yields multiple `cells`; a `DocStringMismatchError` yields `doc`; a
   `ReturnShapeError` and a plain `Error` yield `{}`.
3. **`failingLine`** (core unit): given a stack containing
   `path/to.var.md:12:3`, returns `12`; returns `undefined` when no such frame
   is present; the path is regex-escaped (a `.` in the path does not match
   arbitrary chars).
4. **`generateVirtualModule`** (var-vitest unit): the emitted module wraps the
   run in a try/catch that assigns `ctx.task.meta.varResult` from
   `failureSpans` (only when non-empty) and re-throws, and imports
   `failureSpans`.
5. **reporter** (var-vitest unit): given a fabricated `onFinished` file tree
   (tasks with pass/fail states and `meta.varResult` on the failed ones), a stub
   source reader, and a stub writer, it produces the correct `SpecResults` —
   right `version`, POSIX `specPath`, `sourceHash` matching `hashSource` of the
   provided source, examples grouped per spec in order with reconstructed
   `lines`, `var:diagnostic:*` tasks skipped, and writes to the mirrored path.
6. **website** (existing suite): `run-spec` tests pass unchanged against the
   shared helpers; the deleted `run-types.ts` is fully replaced by the core
   import (build green).
7. **dogfood end-to-end**: running the tutorial via
   `NODE_OPTIONS="--import tsx" npx vitest run` with the reporter enabled
   produces `.var/docs/tutorial/04-yahtzee.var.md.json` (and `06-…`) whose
   examples match the known pass/fail state; a deliberate break flips the
   relevant example to `failed` with the expected `cells`/`doc`.

## Build gate

vitest does not type-check (esbuild/tsx strips types). Run `pnpm -r build`
(exit 0) after any task that touches a shared type or a package's public
exports — adding `result.ts`/`hash.ts`/`failure.ts` to the core's `index.ts`
exports and removing the website's `run-types.ts` are exactly the changes that
break `tsc` while vitest stays green.

## Out of scope / non-goals

- **No LSP, no VSCode, no var.js** here — they consume this format later.
- **No drift baseline** — separate committed artifact (#4); only its seam
  (`name` + `lines`) is reserved, with no new fields.
- **No new rendering** — `cm-run.ts` behavior is untouched.
- **No coercion / intra-value diffs** — unchanged from the return-comparison
  core; the format reddens whole spans.
