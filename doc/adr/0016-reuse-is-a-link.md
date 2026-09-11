# ADR 0016 — Reuse is a link: reference blocks instead of `Background`

- **Status:** Draft
- **Date:** 2026-09-11
- **Deciders:** Aslak Hellesøy
- **Tags:** spec, parsing, gfm, reuse, cross-language

## Context

Varar has no equivalent of Cucumber's `Background:`. The migration guide says so
plainly — "inline its steps into the examples that need them" — and for a large
class of oaths that is the right answer, because a repeated block of setup is
usually a step nobody wrote yet:

```markdown
I create a user "maya". I verify her email. I give her a library card.
I add *Dune* to the catalogue. I add *Emma* to the catalogue.
```

wants to be one sentence at the altitude the reader actually cares about:

```markdown
Maya has a card at a library holding *Dune* and *Emma*.
```

`thin-steps` and `varar-overview` already make that argument, and any reuse
feature risks licensing low-altitude setup that should have been collapsed into
a single stimulus. That is the main reason this has stayed unbuilt.

There is a residue the altitude argument does not cover:

- setup that genuinely is several *distinct* facts, and that the reader must
  **see** to judge the example — collapsing it into one sentence hides the world
  state the oath is about;
- setup shared across several oath **files**, where a step definition is the
  only shared thing and the prose is copy-pasted;
- world states that deserve a name and a definition of their own — "a stocked
  library", "a tenant mid-trial" — that today exist only as a habit.

`Background:` answers only the narrowest version of this: prepend, one per
feature file, same file only, invisible in any individual scenario, and dead
weight that executes only as a prefix and can never be read or run on its own.

What Markdown already gives us, and Gherkin never had, is **a link**. GFM slugs
every heading into an anchor; a link to one renders on GitHub, is clickable, and
means something to a human reader before any tool touches it. And ADR 0012 gave
us a block-level grouping rule with exactly three delimiters, into which a
fourth block *role* — neither example nor prose — fits without new implicit
adjacency machinery.

## Decision

**A block whose entire content is a single link to an oath section is a
*reference block*: it inlines that section's steps at that point, into the
example being built.**

Nothing else. It is a link, not a keyword; it is block structure, not inline
text (ADR 0012 and `markup-is-yours`); and it is positional, so it is not
restricted to the top of an example.

### What is a reference block

A paragraph, blockquote, or list item whose content is exactly one link, whose
target is either

- a **fragment** — `#a-stocked-library` — resolved within the same oath, or
- a **relative `.md` path**, optionally with a fragment —
  `./shared/library.md#a-stocked-library` (no fragment = the whole file).

All three spellings mean the same thing; the blockquote reads as a callout on
GitHub and the list form groups several:

```markdown
[A stocked library](#a-stocked-library)

> [A stocked library](./shared/library.md#a-stocked-library)

- [A stocked library](./shared/library.md#a-stocked-library)
- [Fees are enabled](./shared/billing.md#fees-are-enabled)
```

A link-only block with any **other** target — `https://…`, a `.ts` file, a mail
link — is **prose**, exactly as today. This keeps `See [the docs](https://…).`
working and confines the new meaning to targets that can only be oath sections.

Anchors resolve by **GFM heading slug**. A section is a heading plus everything
up to the next heading of the same or higher level — the same outline the
`scopeStack` already walks.

### What it does

The referenced section's **planned steps**, in order, are spliced into the
current example at the reference block's position, sharing its state. Concretely:

- A reference block is **not a delimiter**. It neither opens nor closes an
  example; a matching paragraph after one continues the same example regardless
  of `precededByDelimiter`.
- A reference block with no open example **starts** one.
- Prose, headings and thematic breaks *inside* the referenced section apply
  there, not here: the referenced section is planned in its own document and
  contributes the steps of the example(s) it contains. A section containing more
  than one example splices them in document order as one merged step list.
- Tables and doc strings attached to the referenced steps travel with them.

Because it is positional, the same construct covers three shapes `Background:`
cannot express. Shared arrange:

```markdown
## Late fees

[A stocked library](#a-stocked-library)

Maya borrows *Emma* on May 25, 2026, due June 1, 2026.
She returns it on June 6, 2026 and owes a £2.50 late fee.
```

Shared act, mid-example:

```markdown
Maya borrows *Emma* on May 25, 2026.

[The nightly batch runs](./shared/jobs.md#the-nightly-batch)

Her account shows a £0.50 fee.
```

Shared assertions, at the end:

```markdown
Maya returns *Emma* late and pays the fee.

[The ledger invariants hold](./shared/invariants.md#the-ledger-invariants-hold)
```

### A referenced section stops being a standalone example

Being linked **consumes** a section. Once any oath references it, it no longer
runs in its own right: it runs only where it is referenced, once per referencing
example. The alternative — running standalone *and* inlined — duplicates every
shared section across the report, doubles its cost, and makes a single failure
appear N+1 times.

The price is that the section loses its own line in the suite, and with it the
guarantee that shared setup is independently verified. It is still verified, but
only through its references: a section nothing links to any more is simply an
ordinary example again (it was never marked as anything else), and a section
whose steps stop matching is reported as drift at its own location — see
[Open questions](#open-questions) for how that is surfaced.

Convention (not a rule): shared sections live in `varar/shared/*.md`.

Note the scope this creates: "is this section referenced?" is **whole-project**
knowledge. It cannot be answered from the file being planned, which has
consequences for single-file runs and for the LSP planning one open buffer — see
[Open questions](#open-questions).

### References do not nest

A referenced section may not itself contain a reference block. Reuse is exactly
one level deep.

This is a deliberate ceiling, not a limitation waiting to be lifted: chained
transclusion makes a reader open three files to learn what the world state is,
which is worse than the repetition it removes. A reference block inside a
referenced section is an error.

It also **eliminates cycles by construction**. With a maximum depth of one, the
only reachable cycle is a section referencing itself, which the nesting rule
already rejects — so there is no cycle *detection* to implement, only a depth
check with a clear message. (If nesting is ever allowed, cycle detection comes
back with it; that is part of the cost of lifting the ceiling.)

### Naming

An example's name stays "its first matching paragraph" — a reference block is
not a matching paragraph, so an example that opens with one is named by its own
first step-bearing paragraph, not by the section it pulls in. Otherwise every
example under a shared setup would be called *A stocked library*.

### Errors

All are authoring mistakes, reported as diagnostics and failing the run — none
degrade to prose:

- **dangling reference** — no such file, or no heading with that slug;
- **nested reference** — a reference block inside a referenced section (this is
  also what makes a cycle unreachable);
- **empty reference** — the resolved section plans no steps;
- **ambiguous anchor** — two headings in the target file slug identically
  (`#setup` / `#setup-1`); lint requires unique headings in any referenced file;
- **unreferenceable construct in a referenced section** — a header-bound table
  (it multiplies examples, which a spliced step list cannot express) or an
  ```error``` fence (expected-failure is a property of an example, not of a
  reusable fragment).

A dangling reference is deliberately *not* drift (ADR 0002). Drift is "this used
to match and now reads as prose", which needs an acknowledgment because prose is
a legitimate destination. A link-only block that resolves to nothing has no
legitimate reading, so it is a hard error.

### Explicitly deferred

Kept out of v1 so the primitive lands small; each is additive:

- **Parameterised references.** If it becomes necessary, the preferred shape is
  a **table attached to the reference block**, read by the referenced section —
  the data stays in the referencing document, so a mismatch diff still lands on
  the value the author wrote. Encoding arguments in the link text (matching it
  against a heading-as-expression) is rejected: the anchor is unreadable and the
  claimed value and the step it feeds end up in different files.
- **Remote references** (`https://specs.example.eu/vat.md#rounding`), pinned by
  content hash in `varar.lock.json`. Interesting as a cross-org executable
  contract — a supplier publishes an oath, every consumer's suite proves they
  honour it — and it fits the attestation story, but it brings supply chain,
  offline builds and CI flakiness. Revisit separately.
- **State snapshotting.** A referenced section is deterministic, so its post-state
  could be cloned rather than re-executed per example. That is an optimisation
  with a cloneability contract attached; it changes no Markdown and can land any
  time.
- **Config-declared backgrounds** (a glob → setup mapping in
  `varar.config.json`) are **rejected outright**: the review unit in Varar is the
  oath diff (`no-theatre`), and setup that is invisible in the document defeats
  that.

## Implementation

The split follows ADR 0012's: syntax in `structure()`, meaning in `plan()`.

- **`scanner` / `structurer` (pure syntax, no registry).** Recognising "this
  block is exactly one link with an oath-shaped target" is syntax, so a new
  `Block` kind — `reference` with `{ path?, fragment?, linkText, span }` — is
  emitted as a candidate's primary block. Candidates keep
  `precededByDelimiter` unchanged.
- **A pure `references(doc)`** returns the reference targets of a document. The
  shell drives the transitive closure: parse, collect, read, repeat — the core
  never touches `node:fs`. This is the hexagonal boundary; it must not be
  smuggled into `plan()` as a file read.
- **`plan()` gains a resolved document set and an inbound set.**
  `plan(doc, registry, { docs, referenced })` where `docs` maps POSIX-relative
  path → already-parsed `Doc`, and `referenced` is the set of (path, slug)
  sections the project links to. A `reference` candidate resolves to a section,
  plans it (memoised per (path, slug); depth is capped at one, so no cycle
  guard), and splices its `PlannedStep`s into the open `MergedExample`. A
  candidate that *is* a referenced section is planned and then dropped, not
  emitted as an example. Two new branches in the grouping loop, and one new
  input the caller must supply.
- **`PlannedStep` gains a document identity.** A step spliced from another file
  has spans in that file. The minimal change is an optional `docPath` on
  `PlannedStep` (absent = the example's own document), threaded through
  `failure` / `result`.
- **Run results (ADR 0014) need a v2.** The payload assumes one document per
  oath: `sourceHash` is a single hash, and a diagnostic's span implicitly
  belongs to the oath file. Per-step `docPath` plus a per-referenced-document
  hash is the smallest extension; the LSP must invalidate an oath's diagnostics
  when **any** document it references changes. This is the largest downstream
  cost of the decision and should be designed before the parser work lands.
- **Conformance.** Bundles are single-`example.md` today. Cross-file references
  need a multi-file bundle shape (an `example.md` plus a `shared/` sibling), and
  `golden/doc.json` / `plan.json` pin reference resolution. Per the corpus rule
  in CLAUDE.md: **anything no corpus pins is what drifts**, so the corpus lands
  with — not after — the first port. `parity.json` grows a `references`
  capability.
- **Drift (ADR 0002) needs care.** Drift is computed per document against
  `varar.lock.json`, and treats a candidate as live when its span overlaps a
  planned example. A referenced section produces **no** planned example in its
  own document, so its paragraphs stop overlapping anything and every one of
  them reads as drift the moment this ships. Liveness has to widen from "overlaps
  a planned example" to "overlaps a planned example **or** was spliced into one",
  which means the referencing side has to report back. This is the second piece
  of whole-project state the change introduces, and the one most likely to be
  got wrong quietly.
- **The inbound index is whole-project.** A full run already globs every oath, so
  building (path, slug) → referrers costs one pass. The hard cases are the ones
  that plan a subset: `vitest path/to/one.md`, and the LSP planning a single open
  buffer. Both need the index, or they will run a referenced section as a
  standalone example (wrong, and green) — see [Open questions](#open-questions).

Rollout: TypeScript first behind the corpus, then the remaining six ports;
`spec` commits per CLAUDE.md, with `Ports-deferred:` footers while it lands
incrementally.

## Consequences

- **A link-only paragraph changes meaning** when its target is a fragment or a
  `.md` path — it was prose (a delimiter), it becomes a reference. Other
  link-only paragraphs are untouched. Breaking in principle
  (`feat(spec)!`), near-zero in practice; the dogfood oaths contain none.
- **Planning stops being a per-document pure function of one document.** Whether
  a section is an example now depends on whether anything, anywhere in the
  project, links to it. Every caller that plans a subset — a single-file vitest
  run, the LSP on one buffer, each port's runner — has to be handed an inbound
  index, and a caller that forgets runs referenced sections as standalone
  examples: wrong, and green. This is the deepest change in the proposal and the
  one that touches all seven ports plus the LSP.
- **Shared setup is no longer independently verified.** A section that only ever
  runs inlined has no line of its own; if every referrer is deleted it silently
  becomes an ordinary example again. Accepted in exchange for not duplicating
  every shared section N+1 times in the report.
- **Drift needs widening, or it fires on every referenced section.** See
  Implementation — liveness has to include "was spliced into an example
  elsewhere".
- **Failures can point at a file other than the one under test.** Editors,
  reporters and the run-result consumers all have to carry a document identity
  per step. This is real work in seven ports plus the LSP.
- **Low-altitude setup gets a cheaper place to hide.** The mitigation is
  documentation, not mechanism: the reuse page should open with the altitude
  argument and present references as the answer for setup the reader must *see*,
  not for setup nobody bothered to name.
- **Cucumber users get a better `Background:`** — one that also does mid-example
  and end-of-example reuse, works across files, and is visible at the point of
  use. That is the line for the migration guide.

## Open questions

Unresolved; each needs a decision before implementation.

1. **How does a subset run get the inbound index?** Options: (a) the runner
   always globs and parses every oath before planning any (accurate, costs a
   project scan on every single-file run and every LSP keystroke); (b) a
   file-level opt-out — shared files live under a glob that `docs` excludes from
   example discovery, making "not standalone" local and cheap but coarse (a whole
   file, not a section); (c) cache the index and invalidate on change. (b) is the
   only option that keeps planning local; it conflicts with section-level
   granularity.
2. **Where is drift reported for a referenced section?** At the section (the
   author's location, but the failure names a file the run may not have targeted)
   or at each reference block (N copies of one problem)?
3. **Does a referenced section show up in the report at all** — as a nested
   `describe` under the referencing example, as a flat run of spliced steps, or
   invisibly? This decides whether a reader of CI output can tell reuse happened.
4. **What if a referenced section sits under headings?** Its own `scopeStack` is
   discarded in favour of the referencing example's — confirm that is right, and
   that the heading is used only as the anchor and the link text.
5. **May an example reference more than one section, and in what order?** The
   list spelling implies yes, in document order; confirm, and decide whether the
   same section twice in one example is an error or a legitimate "do it again".
6. **Is a fragment-less `.md` reference (whole file) worth keeping?** It is the
   one form whose meaning changes when the target file grows a second example.
7. **Does `varar.lock.json` still fingerprint a file that contributes no
   standalone examples?** It must, or edits to shared setup go unnoticed — but
   the entry's meaning changes.
8. **What does the editor do at a reference block?** Go-to-definition is
   obvious; the open question is whether hovering shows the resolved steps
   inline, which is what would keep the "reader must see the world state"
   argument true at the point of use.

## Documentation

- New: `explanation/reuse.md` (why a link, and the altitude argument first).
- New: `how-to/share-setup-between-examples.md`.
- Edit: `reference/examples.mdx` — a fourth block role beside example, prose and
  attachment; the naming rule; the error table.
- Edit: `explanation/varar-for-cucumber-users.md` — the `Background:` row stops
  saying "no equivalent".

New pages ship `draft: true` until the release that carries the feature.
