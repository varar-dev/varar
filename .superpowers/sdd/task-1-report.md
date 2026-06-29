# Task 1 Report: Promote conformance corpus to root `conformance/`

## Status: DONE_WITH_CONCERNS

Commit: `0837b59`

---

## What was changed

### Files moved (history preserved via git rename detection)
`packages/var/bundles/` → `conformance/bundles/` (10 bundle dirs, 60 files total, all detected as git renames)

### Files modified per brief
- `packages/var/tests/conformance.test.ts` line 8:
  `resolve(import.meta.dirname, '../bundles')` → `resolve(import.meta.dirname, '../../../conformance/bundles')`
- `knip.json`: removed `bundles/**` globs from `packages/var` block; added new `conformance` workspace block

### Files modified beyond brief (required to fix module resolution — see concern)
- `pnpm-workspace.yaml`: added `- conformance` to workspace packages list
- `conformance/package.json`: created — minimal workspace package (`@oselvar/conformance`) declaring `@oselvar/var: workspace:*` as a dependency

---

## Deviation from brief + rationale

The brief does not mention `conformance/package.json` or updating `pnpm-workspace.yaml`. However, these were required to fix a module resolution failure the brief could not anticipate.

**Root cause**: The bundle step files (`*.steps.ts`) import from `@oselvar/var`. When they lived inside `packages/var/bundles/`, this worked via Node.js's **self-referencing** mechanism: Node.js walks up the directory tree looking for a `package.json`, found `packages/var/package.json` with `"name": "@oselvar/var"`, and resolved the bare specifier to the package's own exports. After moving to `conformance/bundles/`, the files are no longer inside any workspace package, so self-referencing no longer applies and Node.js reports `Cannot find package '@oselvar/var'`.

**Fix**: Add `conformance/package.json` (declaring `@oselvar/var: workspace:*` as a dep) and register `conformance` in `pnpm-workspace.yaml`. After `pnpm install`, pnpm creates `conformance/node_modules/@oselvar/var → ../packages/var`. Node.js module resolution now walks up from `conformance/bundles/XX/` and finds it at `conformance/node_modules/@oselvar/var`.

This is the standard pnpm-workspace way to wire inter-package dependencies and is the minimal correct fix.

---

## Commands run and output

### `pnpm test`
```
Test Files  73 passed (73)
Tests  437 passed (437)
Start at  00:11:19
Duration  10.24s
```
All 10 conformance suites pass (01-roman-numerals through 10-error-fence-without-step).

### `pnpm knip`
Exit code: 0

Output (informational hints only, no errors):
```
Configuration hints (6)
packages/website/src/layouts/Doc.astro   knip.json  Remove from ignore
**/!(package).json                       knip.json  Remove from ignore
@oselvar/var-lsp  packages/var-vscode    knip.json  Remove from ignoreDependencies
src/index.ts      packages/var           knip.json  Remove redundant entry pattern
.md               packages/var-examples  knip.json  Extension in project not registered…
.md               conformance            knip.json  Extension in project not registered…
```
The `.md` hint for `conformance` is equivalent to the pre-existing hint for `packages/var-examples` — both informational, not errors.

### `pnpm -r build`
All packages built successfully including website.

### `pnpm typecheck`
Exit 0, no errors.

---

## Concerns

1. **`conformance/package.json` adds TS-specific metadata to a "language-neutral" directory.** This is temporary while the TS workspace is still at repo root. The next task (moving TS workspace into `typescript/`) will need to reconsider this — the dependency path `@oselvar/var: workspace:*` will break when packages move, and `pnpm install` must be re-run.

2. **`pnpm-workspace.yaml` now lists `conformance` as a workspace.** If a future language's conformance runner also needs package management (e.g., a Python `pyproject.toml`), the `conformance/` directory will have mixed tooling concerns.

3. **Knip configuration hints** for `.md` extension in `conformance` workspace are informational — same as the pre-existing hint for `packages/var-examples`. Not errors, no action needed.

---

## Follow-up fix (this session)

**Problem:** The two concerns above were addressed. `conformance/package.json` and the `- conformance` entry in `pnpm-workspace.yaml` were removed. Instead, `@oselvar/var` is resolved via a Vitest `resolve.alias` in `packages/var/vitest.config.ts`, and the `knip.json` `packages/var` workspace now includes the conformance bundle globs via relative `../../conformance/bundles/...` patterns.

### Files changed

- **Deleted** `conformance/package.json`
- **`pnpm-workspace.yaml`**: removed `- conformance` line
- **`packages/var/vitest.config.ts`**: added `resolve.alias` mapping `/^@oselvar\/var$/` → `fileURLToPath(new URL('./src/index.ts', import.meta.url))`
- **`knip.json`**: removed `conformance` workspace block; added `../../conformance/bundles/**` globs to `packages/var` workspace entry/project
- Ran `pnpm install` to drop the conformance symlink

### Commands run and output

#### `pnpm test`
```
Test Files  73 passed (73)
Tests  437 passed (437)
Duration  9.87s
```
All 10 conformance suites pass (01-roman-numerals through 10-error-fence-without-step).

#### `pnpm knip`
Exit code: 0 (hints only, same as before)
```
Configuration hints (6)
packages/website/src/layouts/Doc.astro   knip.json  Remove from ignore
**/!(package).json                       knip.json  Remove from ignore
@oselvar/var-lsp  packages/var-vscode    knip.json  Remove from ignoreDependencies
src/index.ts      packages/var           knip.json  Remove redundant entry pattern
.md               packages/var-examples  knip.json  Extension in project not registered…
.md               packages/var           knip.json  Extension in project not registered…
```

#### `pnpm lint`
```
Checked 237 files in 49ms. No fixes applied.
```
Exit code: 0
