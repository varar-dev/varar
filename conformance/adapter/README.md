# Adapter smoke contract

The third conformance corpus. `bundles/` and `config/` gate **pure functions** —
given these bytes, produce those bytes. This one gates **wiring**: that a
test-framework adapter actually does, at `go test` / `mvn test` / `dotnet test`
time, what the core is capable of.

```
conformance/adapter/smoke.sh examples/go-gotest   # one project
conformance/adapter/smoke.sh --all                # every registered adapter
```

## Why it exists

A port can pass every golden in `bundles/` and every case in `config/` and still
ship an adapter that tests nothing. The goldens only ever see the pure core; the
whole imperative shell — oath discovery, step loading, the drift gate,
`VARAR_UPDATE`, emitting one framework test item per example — is invisible to
them. An adapter that discovers zero oaths is 100% conformance-green and reports
a passing suite.

That is not hypothetical. The .NET VSTest adapter had `FileBaselineStore` and
`ReconcileDrift` present and unit-tested, and never called either from
Discover/Run ([#69][]). Every gate was green. `examples/csharp-vstest` shipped
with no `varar.lock.json` and a renamed step would have turned a C# oath example
back into prose with nothing going red — the exact theatre ADR 0002 exists to
prevent, one level up from where ADR 0002 looks.

The same hole had a second instance: `examples/typescript-vitest` shipped no
baseline either, so the vitest gate — which is armed by *data*, not code — never
fired in the flagship dogfood project.

[#69]: https://github.com/varar-dev/varar/issues/69

## What it asserts

The sample projects in `examples/` are the fixtures: one per adapter, all
sharing the same oaths. For each, `smoke.sh` runs the project's real test
command and asserts:

| Check | Asserts | Catches |
| --- | --- | --- |
| `baseline-committed` | `varar.lock.json` is tracked by git | a project that ships no baseline, so the gate is armed against nothing |
| `baseline-complete` | one lock entry per oath on disk | discovery that silently covers a subset, or nothing |
| `drift-detected` | with a drifted baseline the suite exits non-zero, naming the drift and the paragraph | **the adapter never reconciles at all — #69** |
| `drift-accepted` | `VARAR_UPDATE=1` exits zero, and a reconciling adapter re-records the baseline byte-identically | a missing acknowledgment path; a divergent lock serializer |
| `baseline-pruned` | accepting drift also drops entries for oaths the config no longer discovers | the lock hoarding dead paths forever ([#70][]) |

[#70]: https://github.com/varar-dev/varar/issues/70

Plus one check on the corpus itself: **every directory under `examples/` must be
registered in `projects.json`**. A new port that adds a sample project and
forgets to register it fails the *first* port's smoke run — which is what stops
this contract from going stale the way the thing it replaces did.

## The probe

`drift-detected` needs a paragraph that the baseline claims was an example and
that now matches no step. Rather than mutating step definitions (which would be
language-specific) or the `.md` oaths (which are symlinked across projects),
the driver injects one entry into `varar.lock.json`:

```json
{ "name": "You're really not going to like it", "line": 1 }
```

That is the opening prose line of `varar/deep-thought.md`, present in every
sample project. It is a *candidate* paragraph the plan never turns into an
example, so drift re-identifies it by Jaccard word-similarity and reports it —
exactly the state a renamed or deleted step definition leaves behind. Only the
lock file is touched, and it is restored on every exit path.

`baseline-pruned` uses a second probe, `probe.stalePath`: a whole extra oath
entry keyed at `deep-thought.md`, the pre-`varar/` location these samples
actually migrated from. It is well-formed in every respect except that no `docs`
glob matches it any more.

Note that `baseline-pruned` only runs for `reconcile` adapters. `@varar/vitest`
never writes the lock at all, so for `examples/typescript-vitest` the pruning
path lives in `varar run` and is covered by `@varar/cli`'s own tests instead.

## Registering an adapter

Add an entry to `projects.json`:

```json
{
  "dir": "examples/go-gotest",
  "adapter": "varar/go/gotest",
  "command": "go test -count=1 ./...",
  "baseline": "reconcile"
}
```

**`command` must defeat the build tool's result cache.** The smoke run changes
only `varar.lock.json`; a tool that decides "nothing to do" from source
timestamps reports a stale green and makes the whole contract vacuous. That is
why `go` carries `-count=1` and the Gradle projects carry `cleanTest`. If you
add a port, check this deliberately — a cached green here looks identical to a
real one.

**`baseline`** is how the adapter treats the lock file:

- `reconcile` — reads *and* rewrites it on a clean run. Every adapter but one.
- `gate` — read-only. `@varar/vitest` only, because its plugin is a build-time
  Vite transform and its runtime executes in parallel workers; either would be
  the wrong place to write a single shared file. The baseline is recorded by
  `varar run` instead, which is why `examples/typescript-vitest` depends on
  `@varar/cli`.

## Where it runs

From each port's `make` target, immediately after that port's own sample-project
run — see the root `Makefile`. Running it there rather than in one central place
keeps the repo's make-target-equals-CI-workflow invariant, and means a port's
own gate is what tells its author the adapter is unwired.
