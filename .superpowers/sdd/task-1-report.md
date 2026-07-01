# Task 1 Report: Scaffold @oselvar/var-runner (TS)

## Status: DONE

**Commit:** `be54b71`  
**Gate:** `pnpm -r build` exit 0; `pnpm check` (lint + typecheck + 456 tests in 76 files + knip + jscpd) all green  
**Tree clean:** confirmed (`git status --short` — empty)

---

## Package wiring

- `typescript/packages/var-runner/` with `package.json` (name `@oselvar/var-runner`, type module, single dep `@oselvar/var-core: workspace:*`), `tsconfig.json` extending `../../tsconfig.base.json`, `vitest.config.ts` identical to var-cli.
- `@oselvar/var` omitted from deps: knip flagged it unused because none of the Task 1 source files import it. Task 2 (`loadSteps`/`examplesWithRuns`) will add it then.
- `typescript/knip.json`: `packages/var-runner` block added (mirrors `packages/var-cli`).

## renderFailure approach and error shapes

- `CellMismatchError` (from `cell-diff.ts`): carries `readonly cells: ReadonlyArray<CellDiff>`, each with `column`, `span.startLine`, `expected`, `actual`, `ok`. Only failing cells (`!ok`) are rendered: `CellMismatchError\n  path.md:LINE col "COL": expected "X" but was "Y"`.
- `DocStringMismatchError` (from `doc-string-diff.ts`): carries `readonly diff: DocStringDiff` with `span.startLine`, `expected`, `actual`. Rendered as `DocStringMismatchError at path.md:LINE\n  expected: …\n  actual: …`.
- `ReturnShapeError` (from `cell-diff.ts`): rendered as `ReturnShapeError: MESSAGE`.
- Opaque throws: `error.stack` if present (covers Error + message), `error.message` fallback, then `String(error)` — matching `formatError` in var-cli.
- `_source` parameter present in the signature per the brief (future line-context enrichment) but currently unused; prefixed `_` to satisfy `noUnusedParameters`.

## Tests (17 passing)

- `tests/config.test.ts` (4): `readVarConfig` loads / returns defaults; `findSpecs` resolves include and respects exclude
- `tests/run.test.ts` (5): `planSpec` returns `ExecutionPlan` with examples/steps/scopeStack; default and explicit scannerPlugins; `RecordingReporter` records and accumulates diagnostics
- `tests/render.test.ts` (8): CellMismatchError (single, multi-cell, passing-cell filter), DocStringMismatchError, ReturnShapeError, arbitrary Error, non-Error throw, Error without stack
