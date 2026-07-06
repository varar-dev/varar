# Explicit inline text, block-structure plugins

Date: 2026-07-06
Status: design approved; phase 1 implementation in progress

## Why

Two related decisions, driven by one principle: **no magic between the
document and the matcher**.

1. **Inline markup stripping is too magic.** The parser silently removed
   `*emphasis*`, `**strong**`, `_underscores_`, `[links](url)` before
   matching, so step expressions matched text the author never quite wrote.
   Even the project's own maintainers tripped on it ("why doesn't `{title}`
   have a leading `*`?"). Worse, stripping created a dual coordinate system —
   stripped-text offsets for matching, source offsets for everything
   user-facing — bridged by the `inlineMap`/`liftSpan` machinery, the most
   delicate code in every port (the emoji and combining-marks bundles exist
   mostly to pin it).

2. **The core should not be married to Markdown.** Specs might be AsciiDoc
   or any other text markup. What the core actually needs from a format is
   *block structure*: sections, prose blocks, tables, verbatim blocks. The
   scanner already has a plugin seam (`ScannerPlugin`, used by the Gherkin
   tables plugin) that proves the shape.

## The rule

**Format plugins own block structure. Nobody touches inline text.**

- The core operates on plain prose text plus source spans. Sentences,
  matching, comparison — no markup knowledge.
- A format (block-structure) plugin segments the document: what is a
  section heading (example boundaries + describe scope), a prose block
  (paragraph / list item / blockquote), a table, a verbatim block (doc
  strings, `error` fences). Markdown is one such plugin, on by default for
  `.md`/`.mdx`.
- Inline markup is ordinary text. `*Emma*` reaches the matcher as `*Emma*`.
  An author who wants the emphasised run as a parameter writes an explicit
  parameter type:

  ```ts
  title: { regexp: /\*[^*]+\*/, parse: (raw) => raw.slice(1, -1), format: (t) => `*${t}*` }
  ```

  This generalises to any markup (AsciiDoc `_x_` → `/_[^_]+_/`) with zero
  core involvement — parse/format already carries it.

## Consequences (accepted)

- **Styling is load-bearing.** Emphasising a word inside a matched sentence
  changes the text and the match; the no-match/drift diagnostics make that
  visible. The document is executable — its text is the contract.
- **Links and inline code in matched sentences are literal.** Keep rich
  inline markup in narration; matched sentences stay plain (documented).
- **Example names are raw text** (a paragraph name may contain `*Emma*`).
- Breaking spec change: expressions that relied on stripping must add the
  markers to a parameter type. Changelog carries the migration note.

## Phase 1 (this change): explicit inline text

- Delete `stripInline` and the inline coordinate system in every port.
- Block text is the raw source text, minus **block** markers only (the
  `- ` list marker, the `> ` quote prefix, `#` heading marker). Because
  blockquotes drop a per-line prefix, prose blocks keep a **line-granular**
  text→source map: `inlineMap` becomes `segmentMap`, with one entry per
  source line (paragraphs and list items: a single entry). `liftSpan` logic
  is unchanged, just no longer entangled with inline mutations.
- The var-doc conformance artifact renames `inlineMap` → `segmentMap`;
  all goldens regenerate. Bundle prose contains no inline markup, so plans,
  traces and example names are unchanged; the emoji/combining-marks bundles
  keep pinning UTF-16 span behavior, now against raw text.
- The library example's `{title}` becomes the explicit `/\*[^*]+\*/`
  parameter type with parse/format in all four ports.

## Phase 2 (spec'd, not yet built): extract the Markdown block plugin

- Today the Markdown block rules (headings, pipe tables, fences,
  blockquotes, list items) are the scanner's built-ins, with plugins tried
  first. Phase 2 inverts that: the built-ins move behind the same
  `ScannerPlugin`-shaped interface (extended with section/verbatim
  semantics), and `var.config.json` maps docs globs to a format plugin,
  defaulting by extension (`.md`/`.mdx` → markdown). A plain-text fallback
  (blank-line paragraphs, no sections) needs no plugin at all.
- An AsciiDoc plugin (`==` headings, `|===` tables, `----` blocks) then
  becomes a contribution with no core changes. Not scheduled.

## What is intentionally absent

- No `{emphasis}` built-in parameter type (considered and rejected: it
  requires the parser to understand inline markup — the exact magic this
  design removes).
- No inline-markup awareness in drift detection, snippets or diagnostics:
  they all see the same raw text the matcher sees.
