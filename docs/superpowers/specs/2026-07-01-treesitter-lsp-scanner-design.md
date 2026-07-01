# Tree-sitter `StepDefScanner` — first tree-sitter sub-project

Date: 2026-07-01
Status: design, pending implementation (TDD)

First concrete step of the tree-sitter adoption flagged as a direction (not yet
committed) in [ADR 0001](../../adr/0001-second-language-python.md) and detailed
in [`doc/ARCHITECTURE.md`](../../../doc/ARCHITECTURE.md) §2 and §7. This covers
§7 steps 1 and 2 together:

1. Reimplement the TypeScript-compiler-based `StepDefScanner` on tree-sitter,
   keeping the port signature and making the existing tests pass unchanged.
2. Move extraction to the async shell edge; add the `GrammarLoader` port.

Scoped to TypeScript alone — no Python exists yet. Dogfooded for real: `var-lsp`
switches its default scanner to the tree-sitter implementation. `website` and
`var-vscode` are explicitly **not** touched (see Out of scope).

## Why this scope

`buildWorkspaceIndex` (`packages/var-language/src/index-workspace.ts`) already
accepts an injectable `scanner: StepDefScanner`, defaulting to
`createTypeScriptScanner()`. The port shape is already right — ADR 0001 and
ARCHITECTURE.md both call out that only the *implementation* is
TypeScript-compiler-specific. That makes this the natural first cut: swap the
implementation behind an unchanged port, on the one language we already have,
before any second language forces the issue.

Doing this on TypeScript first is what makes the *second* language (Python)
"grammar + queries + fixtures" instead of a from-scratch design exercise.

## Architecture

### `var-language` (stays environment-agnostic)

`web-tree-sitter` runs identically in browser, Node, and Bun from one build, so
the extraction logic itself has no Node dependency — only *supplying grammar
bytes* is per-environment.

- `src/grammar-loader.ts` — the port:
  ```ts
  export interface GrammarLoader {
    load(languageId: string): Promise<Uint8Array>
  }
  ```
- `src/byte-offset.ts` — pure utility. Tree-sitter reports node positions as
  **UTF-8 byte offsets**; the existing `Range` contract (and the TS-compiler
  scanner) uses **UTF-16 code-unit** `{line, character}` positions
  (`ts.SourceFile.getLineAndCharacterOfPosition`). These silently disagree on
  any non-ASCII source text. This module converts a tree-sitter byte offset to
  the same `{line, character}` shape the TS-compiler scanner produces, given
  the source string. Own unit tests with multi-byte fixtures (accented
  characters, an emoji — a UTF-16 surrogate pair).
- `src/tree-sitter-queries.ts` — the per-language surface, as string constants
  (not `.scm` asset files — avoids a second asset-loading mechanism alongside
  `GrammarLoader` in the same sub-project):
  - step-def calls: `context`/`action`/`sensor` call expressions with a
    string-literal first argument, capturing the function name as `kind` and
    an optional arrow/function second argument for handler params.
  - parameter types: `defineState(...)` calls whose second-argument object
    literal has entries with a `regexp` property (regex or string literal).

  The exact tree-sitter-typescript node shapes for these three source shapes
  (string literals, regex literals, arrow functions, call expressions) must be
  verified empirically against real parse trees during implementation — grammar
  internals have shifted across versions before, so this is not assumed.
- `src/tree-sitter-scanner.ts` — `createTreeSitterScanner(grammarLoader:
  GrammarLoader): Promise<StepDefScanner>`. Selects the `typescript` grammar
  for `.ts` files and `typescript-tsx` for `.tsx` files (see TSX below), memoizes
  the one-time `web-tree-sitter` runtime init (`Parser.init()`) at module scope
  so repeated calls (multiple test files, editor restarts) don't reinit
  redundantly, and returns sync `discoverStepDefs`/`discoverParameterTypes`
  closures running the compiled queries against `parser.parse(source)`.

### Why two grammars, not one

`tree-sitter-typescript` ships two distinct grammars: `typescript` (for `.ts`)
and `tsx` (for `.tsx`). They are not interchangeable: the `tsx` grammar treats
`<...>` as JSX first, which can misparse the legacy TS angle-bracket type
assertion (`<Foo>value`) that's valid in `.ts` but disallowed in `.tsx` (where
`as Foo` is required instead). Using the `tsx` grammar for everything risks
silently misparsing that rare-but-real `.ts` syntax. Since both grammars live in
the one `tree-sitter-typescript` npm package, there's no real cost to building
both and selecting by file extension — this also means `.tsx` step files (e.g.
a downstream project with `steps: ['**/*.steps.tsx']` in its `var.config.ts`)
work correctly from day one, not just `.ts`.

### Grammar sourcing — build our own, don't depend on a prebuilt bundle

Considered depending on a prebuilt wasm-grammar bundle (`tree-sitter-wasms`).
Rejected: the actively-published fork (`tree-sitter-wasms` on npm, maintained by
a single individual) is a single-maintainer rebundle with no guarantee it
tracks upstream grammar releases; the original (`sourcegraph/tree-sitter-wasms`)
is two years stale. [cucumber/language-service](https://github.com/cucumber/language-service)
— the project ADR 0001 already draws inspiration from — builds its own grammar
wasm files via `scripts/build.js` rather than depending on a prebuilt bundle.
As of `tree-sitter-cli` 0.26.1+ (current: 0.26.10), `tree-sitter build --wasm`
auto-downloads its own toolchain (wasi-sdk) — Docker/emscripten are no longer
required, so building our own is now cheap.

- `var-lsp` gets two new **devDependencies**: `tree-sitter-cli` (0.26.10) and
  `tree-sitter-typescript` (0.23.2, the official `tree-sitter`-org grammar
  source package — not a prebuilt wasm bundle).
- `packages/var-lsp/scripts/build-grammars.mjs` runs `tree-sitter build --wasm`
  against the `typescript` and `tsx` subdirectories of
  `node_modules/tree-sitter-typescript`, producing
  `packages/var-lsp/grammars/typescript.wasm` and
  `packages/var-lsp/grammars/typescript-tsx.wasm`.
- Both `.wasm` files are **committed to git** (matches how prebuilt-bundle
  packages ship — we're just doing it ourselves, pinned to a grammar version we
  choose). A `build:grammars` package script regenerates them; this must be
  re-run and the output re-committed whenever `tree-sitter-typescript` is
  bumped — call this out in the package README so it isn't forgotten.
- `createNodeGrammarLoader()` (in `var-lsp`) just reads the committed files from
  disk by `languageId` — no runtime dependency on any third-party wasm bundle.
- `web-tree-sitter` (the parser *runtime*, unrelated to grammar sourcing) is a
  regular dependency of `var-language`, since extraction itself must stay
  environment-agnostic.

### `var-lsp` — real dogfood

Mirrors the existing `FileSystem` port / `node-file-system.ts` pattern exactly:

- `src/node-grammar-loader.ts` — `createNodeGrammarLoader(): GrammarLoader`,
  reads the committed `.wasm` files via `node:fs/promises`.
- `store.ts` — add `grammarLoader: GrammarLoader` to `StoreDeps` (alongside
  `fs`). Memoize `createTreeSitterScanner(grammarLoader)` inside the
  already-async `reindex()` (first call pays the init cost; later calls reuse
  it) and pass the resolved scanner into `buildWorkspaceIndex(...)`.
  `createStore` itself stays synchronous — no signature change there.
- `bin.ts` — construct `createNodeGrammarLoader()` next to
  `createNodeFileSystem(root)`.
- `store.test.ts` (×3 call sites) and `handlers.test.ts` (×1) get the new
  `grammarLoader` field added to their deps (real loader — no fake needed,
  since the `.wasm` files are real committed assets, not something a test
  needs to vary).

`buildWorkspaceIndex`'s own default stays `createTypeScriptScanner()` — only
`var-lsp` explicitly passes the tree-sitter scanner. `website` and
`var-vscode` keep working unchanged.

## Testing strategy

- Extract the 12 existing `step-defs.test.ts` cases into shared fixtures; run
  the same fixtures against both `createTypeScriptScanner()` and the new
  tree-sitter scanner (parity proof, avoids literal test duplication `jscpd`
  would flag).
- Add 1–2 new fixtures with non-ASCII expression text (accented characters, an
  emoji) to exercise the byte-offset→UTF-16 conversion.
- One fixture per grammar exercising a plain angle-bracket type assertion in a
  `.ts` file, to lock in that the `typescript` grammar (not `tsx`) is selected
  for `.ts` files.
- `byte-offset.ts` gets its own focused unit tests.
- `var-lsp`'s existing `store.test.ts`/`handlers.test.ts` continue to pass
  unchanged (aside from the new `grammarLoader` field) — the integration-level
  parity proof.
- Gates: `pnpm -r build` (new `src/`) and `pnpm typecheck` / `pnpm check`
  (touched `tests/`).

## Out of scope (explicit follow-ups, per ARCHITECTURE.md §7 steps 3–7)

- `website` and `var-vscode` switching to the tree-sitter scanner — needs their
  own bundler-specific `GrammarLoader` (browser `fetch`, VS Code extension
  packaging) in a later sub-project.
- `StepDef.typeText` becoming a fully opaque string (currently a TS type as
  text — still TS-shaped until this happens).
- Extracting a `SnippetEmitter` port from the TS-emitting snippet code.
- De-hardcoding file-pattern config so a language's file extensions aren't
  assumed.
- Locking Model A vs B (ARCHITECTURE.md §3) for the Python execution seam.
- Standing up the language-agnostic conformance harness.

## Risks

- Tree-sitter-typescript's exact node shapes for string/regex literals and
  call expressions must be verified against real parse trees during
  implementation, not assumed from memory of the grammar.
- Byte-offset vs UTF-16 column mismatch is a real, if currently untested,
  correctness gap for any non-ASCII step-definition source — addressed above,
  not deferred.
- Committed binary grammar artifacts need an explicit regeneration step on
  `tree-sitter-typescript` version bumps, or they silently drift from the
  npm-declared version.
