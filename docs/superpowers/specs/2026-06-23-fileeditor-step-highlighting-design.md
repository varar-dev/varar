# FileEditor step highlighting

**Date:** 2026-06-23
**Status:** Approved, pending implementation plan

## Goal

Highlight matched steps and their captured parameters inside the website's
`FileEditor` component, the way the LSP highlights a `.var.md` file — matched
step sentences underlined, captured parameters shown as chips. Matching reuses
the existing Vár engine and runs at build time, keeping the page fully
prerendered with zero client-side JavaScript.

## Constraints

- **No LSP dependency.** Do not depend on `@oselvar/var-lsp`. The reusable
  matcher already lives in `@oselvar/var-language` (its only deps are
  `@oselvar/var` + `typescript`; the LSP *consumes* it, not the reverse).
  Nothing needs to be moved out of the LSP.
- **Stay prerendered.** All matching happens during `astro build`. No client JS
  is added; the editor remains static HTML + CSS.
- **Reference real `.steps.ts`.** Step definitions come from an actual step file
  (the tutorial's `docs/tutorial/steps/01-hello.steps.ts`), not hand-authored
  expression strings. `discoverStepDefs` parses the TypeScript source
  statically (it never executes it), so the raw source text is sufficient.
- **Match the existing palette.** Cream / ink / hot-pink (`--accent`) / yellow /
  orange, consistent with the rest of the site and the current `FileEditor`.

## Architecture & data flow

The website takes a workspace dependency on `@oselvar/var-language`. At build
time, the tutorial page:

1. Imports the real step file as raw source via Vite's `?raw` suffix:
   `import helloSteps from '.../01-hello.steps.ts?raw'`.
2. Calls `buildWorkspaceIndex({ stepFiles, varFiles })` from
   `@oselvar/var-language`, where `varFiles` is the single in-memory doc
   (`{ path: filename, source: code }`) and `stepFiles` is
   `[{ path, source: helloSteps }]`. This returns `matches[]`, each a `MatchRef`
   with `range` and `paramRanges` (line/character `Range`s) plus `paramValues`.
   This is the same engine and output the LSP's `matchRanges` reads.
3. A new pure helper converts `code` + `matches` into per-line render segments.

The hello step file's expressions (`I greet {string}`,
`the greeting should be {string}`, `` expression `{int}+{int}` ``,
`` evaluate to `{int}` ``) match the hello tutorial content, producing visible
highlights.

## Components

### `packages/website/src/lib/step-highlight.ts` (new, pure)

```ts
export type SegmentKind = 'plain' | 'step' | 'param'
export type Segment = { readonly text: string; readonly kind: SegmentKind }
export type HighlightedLine = ReadonlyArray<Segment>

export function highlightSteps(input: {
  readonly varPath: string
  readonly source: string
  readonly steps: ReadonlyArray<{ readonly path: string; readonly source: string }>
}): ReadonlyArray<HighlightedLine>
```

- Calls `buildWorkspaceIndex`, keeps `matches` whose `varPath` equals `varPath`.
- Splits `source` into lines; for each line builds a character-state map by
  clipping each step `range` and each `paramRange` to that line's bounds
  (handling matches that span multiple lines).
- Params are nested inside steps: a character covered by a param range becomes a
  `param` segment; a character covered only by a step range becomes a `step`
  segment; everything else is `plain`. Adjacent same-kind characters coalesce
  into one `Segment`.
- Returns one `HighlightedLine` (array of segments) per source line, preserving
  exact text (so the gutter line count and content are unchanged).
- If `steps` is empty, returns each line as a single `plain` segment (no call to
  the matcher).

### `packages/website/src/components/FileEditor.astro` (modified)

- New optional prop `steps?: ReadonlyArray<{ path: string; source: string }>`.
- When `steps` is present, the component computes `highlightSteps(...)` and
  renders the code body from segments: `param` → `<span class="fe-param">`,
  `step` → `<span class="fe-step">`, `plain` → text. The gutter (line numbers)
  is generated from the line array exactly as today.
- When `steps` is absent, renders the plain `<code>` body it does today (other
  code samples are unaffected).
- Styling (scoped, using existing CSS variables):
  - `.fe-step` — accent/orange underline (e.g. `text-decoration: underline`,
    `text-decoration-color: var(--accent)`, thick, offset) on matched step text.
  - `.fe-param` — filled chip: `background: var(--accent)`, `color: var(--ink)`,
    small radius, slight horizontal padding.

### `packages/website/src/pages/docs/tutorials/hello-var-your-first-spec.astro` (modified)

- Adds `import helloSteps from '<relative>/docs/tutorial/steps/01-hello.steps.ts?raw'`.
- Passes `steps={[{ path: '01-hello.steps.ts', source: helloSteps }]}` to
  `<FileEditor>` alongside the existing `filename` / `code`.

## Error handling

- If `buildWorkspaceIndex` throws (e.g. a malformed step file), the error
  propagates and fails the build — surfacing regressions rather than silently
  dropping highlights.
- Zero matches is a normal outcome (renders plain), not an error.

## Testing

- Matching correctness is already covered by `@oselvar/var` and
  `@oselvar/var-language` test suites; this work does not re-test the engine.
- Add a focused unit test for the pure `highlightSteps` helper covering:
  single-line step with one param, multiple params on a line, a line with no
  match (all `plain`), and segment coalescing/nesting (param inside step). This
  requires a `vitest.config.ts` for the website package so the root workspace
  picks it up.
- Build-output verification: after `pnpm --filter @oselvar/website build`, the
  tutorial's `index.html` contains `.fe-step` and `.fe-param` spans wrapping the
  expected substrings, and the page remains script-free (still prerendered).

## Out of scope

- Ambiguous / missing-step diagnostics (the LSP shows these; not needed here).
- Dimming unmatched prose.
- Any client-side interactivity (copy button, live editing).
- Syntax highlighting of non-step Markdown.
