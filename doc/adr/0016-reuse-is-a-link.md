# ADR 0016 — Reuse is a link: reference blocks instead of `Background`

- **Status:** Accepted (implemented)
- **Date:** 2026-09-11 (implemented 2026-09-11)
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

### References nest, and depth is a style question

A referenced section may itself contain reference blocks, to any depth. The
steps of an example are the depth-first, document-order flattening of its
reference graph.

Deep chains are **bad practice** — a reader who must open three files to learn
what the world state is has lost more than the repetition saved — but that is a
judgement about a particular document, not a property the parser can decide.
Varar's line is that the tool enforces what is *checkable* (an anchor resolves,
a step matches, a claimed value holds) and leaves what is *tasteful* to prose:
the reuse how-to and the authoring skills say "one level, two at the outside",
and review catches the rest. Encoding a depth ceiling would also be the first
place Varar told an author their correct document was disallowed on style
grounds.

The cost is real and is accepted:

- **Cycles become reachable and must be detected.** A → B → A, and the
  self-reference A → A, are errors reported with the full chain
  (`library.md#stocked → billing.md#fees → library.md#stocked`), not a stack
  overflow.
- **An example's steps can come from arbitrarily many documents.** The per-step
  document identity below already carries this; nothing further is needed, but
  the "which file am I looking at" burden on reporters and the LSP grows.
- **Cost is multiplicative.** A section referenced from a section referenced by
  forty examples runs forty times. Nothing caps it; the deferred state-snapshot
  optimisation is the eventual answer.

### Naming

An example's name stays "its first matching paragraph" — a reference block is
not a matching paragraph, so an example that opens with one is named by its own
first step-bearing paragraph, not by the section it pulls in. Otherwise every
example under a shared setup would be called *A stocked library*.

### Errors

All are authoring mistakes, reported as diagnostics and failing the run — none
degrade to prose:

- **dangling reference** — no such file, or no heading with that slug;
- **cycle** — a reference chain that reaches a section already on the chain,
  including a section referencing itself; reported with the whole chain;
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

## The inbound index

"A section that is linked stops being a standalone example" is the rule with the
longest reach in this ADR, because it makes planning depend on the whole project.
This section resolves how.

### What the ports do today

Every runner already performs a **whole-project glob once per run**, and every
one of them already does it for a reason that is the same shape as this problem
— pruning `varar.lock.json` entries for oaths the config no longer discovers,
which must be keyed off the config globs and *not* off the files the runner
happened to collect:

| Port | Once-per-run whole-project seam |
|------|----------------------------------|
| vitest | plugin `config()` / `configResolved()` — globs `docs`, and `load()` already reads **every step file** per oath |
| pytest | `pytest_configure` → `find_oaths(...)`, explicitly *not* the collected subset ("`pytest tests/one_dir/` is a filtered view") |
| JUnit | `OathTestEngine` — `onDisk` walk before pruning |
| Kotest | `OathSpec` — "`findOaths` ignores whatever test filter Kotest was given" |
| minitest / RSpec | `Runner.find_oaths(...)` at load |
| cargo test | `find_oaths(&config, root)` |
| go test | `runner.FindOaths(cfg, root)` — "Collect always discovers everything" |
| .NET | `Discovery.FindOaths(workspace.Config, workspace.Root)` |

The LSP is not the hard case it looked like either: `store.reindex()` lists
**every** oath, reads every source, and hands the lot to `buildWorkspaceIndex`,
which already parses and plans all of them — and it does this on every
`didChange`, not per buffer. The LSP is already whole-project on every keystroke.

Planning itself is per-file and lazy everywhere (`planOath(path, source,
registry)`, `OathFile.collect`, the vitest `load()` hook), which is the seam that
has to change — but the *discovery* it would need already happens one layer up.

### Decision

**Build the inbound index at the existing once-per-run glob seam, in every
port.** Concretely: at that point, read and `parse()` every discovered oath
(parsing is pure and executes no step code), collect every reference block, and
carry the resulting `(path, slug) → referrers` map into each `plan()` call.

The decisive argument is **determinism**: whether a section is a test must not
depend on which files the invocation happened to select. A best-effort index
built from "the files this run planned" would make `pytest tests/fees/` and
`pytest` disagree about whether `shared/library.md` contains a test — the same
source, two answers, both green. That is the failure mode Varar exists to rule
out.

### The alternative, and why not

**A file-level opt-out** — shared sections live under a glob `docs` excludes from
example discovery — keeps planning local and needs no index at all. It was the
tempting option, and it loses on three counts:

1. It does not save the I/O. Resolving a reference still reads the target file
   (the *forward* closure). The index only adds inbound bookkeeping over sources
   the run already has in hand.
2. It is coarse: a whole file becomes shared-only, so a file cannot hold both
   ordinary examples and a section other files link to.
3. It adds a second configuration concept that means the same thing as a link,
   and can disagree with it — a file in the shared glob that nothing references,
   or a referenced section in a file that is not.

### The real costs

- **vitest watch mode gets wider invalidation.** Editing *any* oath can change
  another oath's plan, so `load()` must `addWatchFile` every oath, not just the
  step files. Precedented — step files already force a re-transform of every
  oath — but it means one keystroke in a shared oath re-transforms the project.
- **Filtered runs parse files they do not run.** Parse-only, no step execution,
  bounded by the oath count, and cached by (path, hash) — see
  [Keeping the LSP fast](#keeping-the-lsp-fast), whose caches the runners share.

## Port and runner compatibility

The adapters differ in *when* they plan, and two of them have hazards the others
do not. Everything below is a decision, not an open question.

| Adapter | How examples are produced today | What changes |
|---------|---------------------------------|--------------|
| cargo test | `trials_recording` loops every oath from `find_oaths` in one function | one pre-pass in the same loop |
| go test | `Collect` — "always discovers everything" | same |
| .NET | `Discovery.FindOaths` then a loop | same |
| JUnit / Kotest | engine/spec walks the on-disk set in one place | same |
| RSpec / minitest | `Runner.find_oaths` at load | same |
| pytest | plans lazily in `pytest_collect_file` → `OathFile.collect`, but `pytest_configure` already stashes the full set | index into the stash |
| vitest | plans lazily in the `load()` hook per oath; `configResolved` already globs the full set | index built there, cached; plus the zero-test fix below |

Five ports already hold every oath in one loop, so the index is a local change.
The two that plan lazily both already stash the whole set for baseline pruning.
No port needs a new discovery pass.

### Document identity must become the same thing in every port

This is a **prerequisite**, and it is currently broken. The path handed to
`parse()` differs per port: pytest passes `self.path.name` (a *basename*), Rust
passes `file_name`, .NET passes a workspace-relative POSIX path, the vitest
plugin and the LSP pass absolute paths. A relative link — `./shared/library.md`
— cannot be resolved against a basename, and two same-named oaths in different
directories are indistinguishable.

**Decision: `doc.path` is the workspace-relative POSIX path in every port**, the
identity `varar.lock.json` and `.varar/<oathPath>.json` already use. It lands
before the reference work as its own `fix(spec)` change, which is worth doing on
its own merits — `doc.path` currently means three different things. Each port's
failure rendering must be checked for basename assumptions as part of it.

### vitest: a fully-consumed oath must not become a zero-test file

`test.include` is driven straight from the `docs` globs, so every oath is a test
*file*. An oath whose sections are all consumed would register no tests, and
vitest fails that file outright (verified on vitest 5.0.0):

```
FAIL  empty.test.ts [ empty.test.ts ]
Error: No test suite found in file …/empty.test.ts
```

**Decision: a fully-consumed oath transforms to a module containing a single
empty `describe.skip(...)`**, named for the oath and its referrers. Verified: the
run reports `Test Files 1 skipped (1)`, no error, no failure — which is also the
honest report, since the file holds no standalone example.

The alternative — dropping consumed oaths from `test.include` — is rejected:
`include` is fixed in the `config()` hook, so the first watch-mode edit that
consumes or releases a section would need a dev-server restart to take effect.
Transforming the module instead makes the transition an ordinary re-transform.

No other adapter has this problem: an empty pytest collector, a childless JUnit
descriptor, a Go parent test with no subtests and a .NET discovery yielding no
test cases are all silent and green.

### The index is a required argument, not an optional one

The likeliest way this decays is a port that keeps calling the old
single-argument `plan()` and runs shared sections as standalone examples —
wrong, and green, in exactly the way ADR 0014 describes for unpinned fields.
Three gates, deliberately redundant:

1. **The core's `plan()` takes the index as a required parameter** in all seven
   ports. The five statically-typed ports fail to compile; Python and Ruby fail
   loudly at the first call. No defaulting to "no references".
2. **A conformance bundle pins it**: a multi-file bundle where one file's section
   is consumed by another, whose `golden/plan.json` for the *defining* file has an
   empty example list. A port that ignores the index produces a non-empty plan
   and goes red.
3. **An `adapter/` smoke case** runs each example project's real test command and
   asserts the consumed oath contributes no test. The corpus exists precisely
   because a port can be conformance-green and wired wrong; "shared sections run
   twice" is that failure exactly.

### Run results for a consumed oath

Adapters write `.varar/<oathPath>.json` for every oath they *discovered*,
including a consumed one — with an empty example list. Skipping the file would
leave the LSP showing diagnostics from the run before the section was consumed.
For the same reason baseline pruning keeps a consumed oath's `varar.lock.json`
entry: it is still a discovered oath, and its source is still fingerprinted.

## Keeping the LSP fast

### What it costs today

Every `didChange` writes the buffer through to the filesystem and calls
`store.reindex()`, which re-globs the workspace, re-reads every step file,
re-runs the **tree-sitter scan on all of them**, re-reads every oath, and
re-parses and re-plans all of them — and then `driftDiagnosticRefs` parses and
plans **every oath a second time**. There is no debounce: that is the cost of one
keystroke today, twice over.

References do not introduce this, but they would make the whole-project shape
permanent, so the incrementality lands with them.

### Four changes, in order of payoff

1. **Debounce `reindex`** — a trailing ~75 ms coalescing timer, so a burst of
   typing produces one index, not one per character. Alone, this removes most of
   the cost of fast typing.
2. **Memoise by content hash.** `parse()` is pure, and the tree-sitter step scan
   is pure in its file's source; cache both keyed by `(path, contentHash)`. After
   the first index, a keystroke re-parses exactly one file and re-scans no step
   files at all.
3. **Invalidate along the reference graph.** The inbound index *is* a dependency
   graph, so a changed oath re-plans only

       {edited} ∪ referrers*(edited) ∪ targets(edited before) ∪ targets(edited after)

   — the last two because editing a reference block changes whether its old and
   new targets are standalone. A change that affects the *registry* (a step file,
   `varar.config.json`) still invalidates every plan, as it must.
4. **Delete the double plan.** `driftDiagnosticRefs` re-parses and re-plans every
   oath; hand it the plans `buildWorkspaceIndex` just computed instead. This is a
   straight halving, and it is worth doing whether or not references ship.

The result is that with references the LSP does *less* work per keystroke than it
does today: an edit to an ordinary oath costs one parse and one plan, and an edit
to a shared oath costs one parse plus a re-plan of its referrers. The pathological
case — a project where every oath references one shared file — is bounded by the
referrer count, and is the same document shape the reuse docs (and the optional
depth lint) warn against.

The browser LSP used by the website runs the same store over a memory filesystem
and gets the identical improvement.

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
  plans it (memoised per (path, slug), with the chain of in-progress sections
  carried down so a repeat is reported as a cycle rather than recursing), and
  splices its `PlannedStep`s into the open `MergedExample`. A
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
- **The inbound index** is built at each port's existing once-per-run glob and
  passed to `plan()` as a required argument — see
  [The inbound index](#the-inbound-index) and
  [Port and runner compatibility](#port-and-runner-compatibility).

Rollout, in dependency order — each step is independently shippable and green:

1. **`doc.path` becomes the workspace-relative POSIX path in every port**
   (`fix(spec)`). A prerequisite, and an improvement on its own: the field
   currently means a basename, a relative path or an absolute path depending on
   who called.
2. **LSP incrementality** — debounce, hash-keyed caches, and dropping the double
   plan (`perf(ts/lsp)`). Independent of references, and a win today.
3. **The reference block itself**, TypeScript first behind the new multi-file
   conformance bundle, then the remaining six ports; `spec` commits with
   `Ports-deferred:` footers while it lands incrementally.
4. **Run-result v2** (per-step document identity) with its golden, once the
   parser work proves the shape.

## Consequences

- **A link-only paragraph changes meaning** when its target is a fragment or a
  `.md` path — it was prose (a delimiter), it becomes a reference. Other
  link-only paragraphs are untouched. Breaking in principle
  (`feat(spec)!`), near-zero in practice; the dogfood oaths contain none.
- **Planning stops being a per-document pure function of one document.** Whether
  a section is an example now depends on whether anything, anywhere in the
  project, links to it, so every caller that plans an oath must be handed an
  inbound index. A caller that forgets runs referenced sections as standalone
  examples: wrong, and green. See [The inbound index](#the-inbound-index) — the
  seam exists in all seven ports already, but every one of them has to use it.
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

1. ~~How does a subset run get the inbound index?~~ **Resolved** — see
   [The inbound index](#the-inbound-index).
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
7. ~~Does `varar.lock.json` still fingerprint a consumed file?~~ **Resolved** —
   yes; see [Run results for a consumed oath](#run-results-for-a-consumed-oath).
   What remains open is what a consumed file's baseline entry *means* once its
   paragraphs are live only through their referrers.
8. **What does the editor do at a reference block?** Go-to-definition is
   obvious; the open question is whether hovering shows the resolved steps
   inline, which is what would keep the "reader must see the world state"
   argument true at the point of use. With nesting allowed, a hover that
   resolves the *whole* chain is the thing that keeps a deep document readable
   despite itself.
9. **Is an opt-in depth lint worth it?** Nesting depth is a style question and
   stays out of the parser, but `reference/lint.md` is where checkable house
   style already lives. A rule that is **off by default** and warns past a
   configured depth would let a team enforce its own ceiling without Varar
   picking one. Decide whether that is a useful escape hatch or the same
   prohibition wearing a hat.

## Documentation

- New: `explanation/reuse.md` (why a link, the altitude argument first, and why
  nesting depth is left to judgement rather than enforced).
- New: `how-to/share-setup-between-examples.md` — including the house-style
  guidance the parser deliberately does not enforce: one level, two at the
  outside; a chain a reader cannot hold in their head is a step nobody wrote.
- Edit: `how-to/agent-instructions.md` and the authoring skills — an agent
  generating oaths is exactly the author most likely to build a deep reference
  chain, so the depth guidance has to reach the instruction block, not only the
  prose docs.
- Edit: `reference/examples.mdx` — a fourth block role beside example, prose and
  attachment; the naming rule; the error table.
- Edit: `explanation/varar-for-cucumber-users.md` — the `Background:` row stops
  saying "no equivalent".

New pages ship `draft: true` until the release that carries the feature.

## What shipped, and how it differs from this plan

Implemented across all seven ports. Three deliberate deviations, and one bug the
corpus caught:

1. **Reference blocks are recognised in `plan()`, not the structurer.** The ADR
   proposed a new `reference` `Block` kind emitted by `structure()`. Detecting a
   link-only block is equally pure in the planner, and keeping it there left
   `golden/doc.json` untouched in every port — the var-doc artifact did not have
   to change at all. `plan()` returns a reference *unit*, which is where the
   splice already had to happen.

2. **Sections resolve through the scope stack, not a heading index.** A
   candidate belongs to a section iff the section's slug is in its `scopeStack`
   — which is exactly "from this heading until the next of the same or higher
   level", already computed. No `headings` field was added to `Doc`, so no
   golden moved. The cost is the **ambiguous-anchor** error from the Errors
   list: two headings in one file that slug identically are indistinguishable
   this way, so that case is not detected. It remains open (see below).

3. **`PlannedStep` gained `paramTexts` as well as `docPath`.** Not in the plan,
   and necessary: consumers sliced the *running* oath's source by a step's
   param spans to recover the matched notation (the conformance artifact's
   `args[].value`, the LSP's rename values). For a spliced step those spans
   belong to another document, so the slice returned whatever text sat at those
   offsets. Slicing at plan time, from the document the step was written in,
   removes the hazard at its source rather than teaching each consumer about it.

4. **The corpus caught a real divergence.** `21-reference-consumed` was green in
   six ports and red in .NET: `MergedExample.ScopeStack` was `init`-only, so the
   name-replacement rule updated the name but left the *referenced* section's
   heading chain on the example. Exactly the failure mode the bundle exists to
   catch, caught on its first run.

Two adapter-level notes:

- **vitest's zero-test file** was handled as decided, but the placeholder is a
  single bookkeeping test rather than an empty `describe.skip`. A skipped suite
  keeps vitest happy, but no test body runs — and the drift baseline and the
  `.varar` run record are both written from a test body, so a consumed oath
  would have silently dropped out of `varar.lock.json` (the adapter smoke
  contract's `baseline-complete` check caught this). One `varar:referenced-
  elsewhere` test attaches both, alongside the `varar:diagnostic:*` and
  `varar:stale-oath-transform` tests the runtime already registers.
- **`smoke.sh` now globs oaths recursively.** It listed `varar/*.md`, which
  cannot see the `varar/shared/` convention this ADR introduces.

### Still open

- **Run-result v2 (ADR 0014).** `docPath` reaches the plan and the plan artifact,
  but *not* the persisted `.varar/<oath>.json` payload. Until it does, a failure
  inside a referenced section is reported to the LSP with spans in that section's
  document and a `sourceHash` for the referencing one, so the editor will not
  place it. **A mismatch inside a shared section is therefore not yet rendered
  correctly in editors** — the run still fails, with the correct message, in
  every runner. This is the next piece of work, and it is a cross-port payload
  change with its own golden.
- **Ambiguous anchors** (deviation 2) are undetected; the lint rule requiring
  unique headings in a referenced file is not written.
- **LSP reference support** — go-to-definition and hover on a reference block —
  is not implemented; the block is inert in the editor beyond ordinary Markdown.
- Open questions 2–6, 8 and 9 stand as written.
