# ADR 0002 — Oath drift detection and explicit acknowledgment

- **Status:** Accepted — **implemented** across all ports (2026-07-07)
- **Date:** 2026-07-01
- **Deciders:** Aslak Hellesøy
- **Tags:** runtime, run-result, drift, cross-language, hashing

> **Implementation note (2026-07-07).** Shipped in TypeScript, Python, and the
> JVM, tracked by
> [the drift-detection design spec](../superpowers/specs/2026-07-06-drift-detection-design.md).
> Two refinements to this ADR emerged in build:
> (1) **No `sourceHash` short-circuit** for detection — a step rename leaves the
> Markdown (and its hash) untouched yet is the primary drift case, so detection
> always re-plans; the fingerprint is recorded but not used to gate detection.
> (2) **Writer vs read-only gate.** `var run` (and the Python/JVM test runners,
> which have no separate CLI) is the writer that records/accepts; vitest is a
> read-only gate. Re-identification uses **text similarity** (Jaccard ≥ 0.5), so
> moving and rewording examples never false-alarm.

## Context

`var` deliberately treats a Markdown paragraph as an **example** only if at least
one of its sentences matches a step definition. A paragraph that matches nothing
is **prose** — documentation, silently ignored by the runner. This is what lets an
oath file freely mix narrative with executable examples (see
[Examples](../../typescript/packages/website/src/content/docs/reference/examples.mdx)).

That rule has a dangerous edge. A paragraph that **was** an example can stop
matching — a step definition is renamed or deleted, or a typo creeps into the
Markdown — and it silently reverts to prose. The suite stays green while testing
*less* than it did. This is the worst failure mode in a test system: coverage
decaying with no failing test, i.e. false confidence. "Silent drop" cannot tell
an *intentional* prose paragraph (never matched) apart from a *regression* (used
to match, now doesn't).

We already have the substrate for detecting change, but only in TypeScript and
only for a narrower purpose:

- `hashSource` — an FNV-1a (32-bit, over UTF-16 code units, `fnv1a:` prefix)
  change-detector in `typescript/packages/var-core/src/hash.ts`. Tiny,
  dependency-free, trivially re-implementable in any language.
- `OathResults` (`typescript/packages/var-core/src/result.ts`) — the persisted
  per-oath run record (`.var/<oath>.json`) carrying `sourceHash` and the list of
  examples that ran.
- `runResultDiagnostics` (`.../run-diagnostics.ts`) — projects a recorded result
  onto the *current* source and, if `hashSource(source) !== results.sourceHash`,
  emits nothing (the recorded offsets are stale). This is **staleness**
  invalidation, not drift detection.

Python has *none* of this yet. And neither implementation detects drift or gates
on it. Two requirements shape the decision: drift must be caught **at run time in
the runner** (not merely surfaced in an editor), and it must behave **identically
in every implementation**.

## Decision

We will detect **drift** — *a paragraph that was previously an example and no
longer matches any step definition* — and require the user to **explicitly
acknowledge** it. Drift is never resolved silently: neither silently dropped
(losing coverage) nor silently passed.

Mechanism (specified enough to build; details refined at implementation):

1. **Baseline.** Persist, per oath file, the set of examples that ran last time
   (each example's name + source anchor) alongside the source fingerprint
   `sourceHash`. Reuse/extend the existing run-result record (`OathResults` /
   `.var/<oath>.json`) rather than inventing a parallel store.
2. **Detect.** On each run:
   - if `hashSource(currentSource) === baseline.sourceHash`, the file is
     unchanged — no drift possible;
   - otherwise re-parse and diff against the baseline: a baseline example whose
     paragraph now yields **zero matched steps** has **drifted**. A brand-new
     prose paragraph that was *never* an example is **not** drift.
3. **Gate in the runner.** A detected, **unacknowledged** drift makes the run
   **fail** — a red test / non-zero exit — with a message naming the drifted
   example and its `.md` line. A renamed or broken step definition therefore
   cannot silently stop being tested.
4. **Acknowledge.** The user *explicitly accepts* the drift through an
   approval-style affordance (analogous to a snapshot test's `--update`).
   Accepting records the new baseline — "yes, this paragraph is *intentionally*
   no longer an example" — and the run goes green. Until accepted, the drift is
   surfaced, not swallowed.
5. **Fingerprint stays FNV-1a.** Keep `hashSource` (FNV-1a 32-bit over UTF-16
   code units, `fnv1a:` prefix) as the change-detector — it is already the
   cross-language contract, and being tiny and dependency-free it re-implements
   identically in every language.

The distinction the decision turns on:

- A paragraph that **never** matched → prose, silently ignored (no ceremony).
- A paragraph that **stops** matching → drift, surfaced and held until the user
  explicitly accepts it.

## Cross-language / rollout

- Drift is a **runtime / run-result** concern, so it lives in the shared shell
  (`var-runner`) and the runner adapters, layered on the pure core's
  parse/match (which already knows which paragraphs are examples). It is *not*
  runtime-collection behaviour and *not* part of the conformance corpus.
- **It must slot into the normal runner run to be useful** — surfaced through a
  regular `pytest` / `vitest` / `var run`, in **both** implementations — not as a
  separate tool.
- Implementation order (each its own design spec → plan): port `hash.ts` + the
  `OathResults` run-result format + baseline persistence to Python; then add
  drift detection + the acknowledgment affordance to **both** `var-runner`s and
  surface it through the adapters. The cross-implementation consistency rules
  apply: same fingerprint, same record shape, same drift semantics, same
  acknowledgment UX (modulo language idiom).

## Consequences

### Positive

- Closes the silent-coverage-loss footgun: "this used to be tested" can no longer
  vanish unnoticed.
- Cleanly separates *intentional prose* (never matched) from a *regression*
  (stopped matching) using history rather than heuristics.
- Reuses an existing, language-neutral fingerprint and run-result format instead
  of new machinery.
- CI-enforceable: an unacknowledged drift fails the build.

### Negative / risks

- Requires persisting a per-oath **baseline** (state on disk, under `.var/`), and
  that baseline must be committed / shared for the gate to hold in CI.
- Introduces an approval workflow (some ceremony, like snapshot tests) — the cost
  of not being silent.
- Whole-file deletion or rename is a *different* signal (the oath is gone, not
  drifted) and is out of scope here.

## Alternatives considered

- **Silent drop (status quo).** A zero-match paragraph is prose, dropped. Simple,
  but is exactly the footgun — a typo'd or renamed step silently stops testing.
  Rejected.
- **Any zero-match sentence is an error.** Rejected earlier during the pytest
  plugin work: legitimate prose in an oath would spuriously fail, and there is no
  way to distinguish a typo from intended prose *without history*.
- **Editor / LSP "missing step" diagnostic only.** Helpful for authoring, but it
  does not gate the runner or CI — a developer who never opens the editor never
  sees it. Complementary, not sufficient.
- **Hash-baseline drift + explicit acknowledgment (chosen).** History (the
  baseline) distinguishes drift from prose; the runner gate plus explicit
  acknowledgment makes it safe, visible, and CI-enforceable.

## References

- [Examples](../../typescript/packages/website/src/content/docs/reference/examples.mdx) — the user-facing statement of these semantics (the [Drift detection](../../typescript/packages/website/src/content/docs/reference/examples.mdx#drift-detection) section).
- `typescript/packages/var-core/src/{hash,result,run-diagnostics}.ts` — the existing TS substrate (fingerprint + run-result + staleness).
- [Run-result format design](../superpowers/specs/2026-06-28-run-result-format-design.md), [Run-result diagnostics design](../superpowers/specs/2026-06-28-run-result-diagnostics-design.md).
- [ADR 0001 — Python as the second supported language](0001-second-language-python.md).
- [Cross-implementation consistency design](../superpowers/specs/2026-06-30-cross-implementation-consistency-design.md).
- [Issue #2 — Python port](https://github.com/oselvar/var/issues/2).
