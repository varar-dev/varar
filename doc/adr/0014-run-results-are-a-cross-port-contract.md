# ADR 0014 — Every port persists run results; the payload is a cross-port contract

- **Status:** Accepted
- **Date:** 2026-07-30
- **Deciders:** Aslak Hellesøy
- **Tags:** run-results, lsp, conformance, ports

## Context

One language server serves every language Varar supports. It reads
`.varar/<oathPath>.json` — a serialized `OathResults` — and turns each failure
into an editor diagnostic: the squiggle under a mismatched cell, and (since the
failure payload gained an `anchor`) under the exact step that threw.

Only the TypeScript vitest reporter writes that file. Everything else in the
pipeline is language-neutral, so a Python, Ruby, Java, Rust, .NET or Go user
gets the same editor, the same oath files, the same steps — and no run
diagnostics at all, because nothing in their toolchain ever leaves a result
behind.

The payload itself had drifted into three states, which is what surfaced this:

| Port | `result`/`failure` | Consumer |
|------|--------------------|----------|
| TypeScript | yes | vitest reporter persists it; the LSP, VS Code and the website read it |
| Java | yes | `Render.renderFailure` formats console output from it; never persisted |
| Python, Rust | yes | none — produced by the core, read by nothing but its own tests |
| Ruby, .NET, Go | no | failures render straight off the error |

An audit of the seven cores explains why: **every core module pinned by a
conformance corpus exists in all seven ports; the two that no corpus pins —
`result` and the `failure` payload — exist in four.** `failure_anchor` is in
all seven precisely because `bundles/*/golden/trace.json` pins `failure.anchor`
byte-for-byte. Drift is the complement of conformance coverage, not a lapse of
discipline.

That left two coherent options: delete the unused copies and call run results a
TypeScript feature, or give the payload the cross-port job it was always shaped
for.

## Decision

**Run results are a cross-port contract. Every port's adapters persist them,
and the corpus pins the format.**

1. **Every port implements `result` + `failure`** — the payload and the
   producer that turns a caught step failure into it, `anchor` included.

2. **Every adapter writes `<root>/.varar/<oathPath>.json` at the end of a run**,
   for every oath it executed — passing runs too, since the LSP needs to clear
   stale diagnostics. Concretely:

   - `oathPath` is the oath's path relative to the workspace root, POSIX
     separators; the file nests under `.varar/` by that path
     (`varar/library.md` → `.varar/varar/library.md.json`).
   - Content is `JSON.stringify(results, null, 2)` plus a trailing newline —
     2-space indent, LF, declaration order (**not** the canonical key sort the
     conformance goldens use; this file is written for diffing by humans and
     parsing by the LSP, not for byte-comparison across ports).
   - `sourceHash` is `hashSource(source)` over the oath's bytes as run. The LSP
     drops every diagnostic when the hash no longer matches the buffer, which
     is what stops a stale result from pointing at moved text.
   - `version` is `1`.

3. **`stack` stays runtime-shaped.** A V8 stack, a JVM stack trace and a Rust
   rendered location have nothing in common, and no consumer parses it — it is
   there for a human reading the file. Everything a renderer *acts* on
   (`line`, `message`, `cells`, `anchor`) is portable and identical across
   ports.

4. **A new `golden/results.json` per conformance bundle pins the payload**
   across all seven ports, minus `stack` for the reason above. This is the part
   that keeps the decision true: the next field added to the payload either
   lands everywhere or turns a build red.

5. **Optional fields stay optional.** `cells` and `anchor` are absent, not
   null, when they don't apply. A result written by an older release — or by a
   port that has not caught up — still parses, and the LSP falls back to the
   failing line.

## Consequences

- Run diagnostics work in every editor for every language, not just for vitest
  users. That is the user-visible payoff, and it is the reason the payload is
  worth having in six more places.
- Three ports gain `result` + `failure`; two ports' previously unused copies
  (Python, Rust) acquire a consumer. Java keeps rendering console output from
  the same payload it now also persists.
- `.varar/` must be gitignored in every example project and in user projects —
  it is a run artifact keyed by source hash, worthless once the source moves.
- The corpus grows a fifth golden per bundle, and each port's conformance
  harness grows one emitter. That is the ongoing cost of the guarantee.
- Adapters that cannot see the whole run at once (a test framework with no
  end-of-run hook) must accumulate per-oath and flush on process exit. Each
  port's runner owns that logic so the adapters stay thin.
