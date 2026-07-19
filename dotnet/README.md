# Varar — .NET (C#) port

Full-pipeline port of Varar on the CLR. See the design/plan under `doc/`:

- ADR [0008](../doc/adr/0008-dotnet-port.md) (port) · [0009](../doc/adr/0009-dotnet-test-adapter-integration.md) (VSTest adapter)
- Specs: [core + facade](../doc/superpowers/specs/2026-07-19-dotnet-core-port-design.md), [runner + adapter](../doc/superpowers/specs/2026-07-19-dotnet-runner-adapter-design.md)
- Plans: [core](../doc/superpowers/plans/2026-07-19-dotnet-core-port.md), [runner/adapters](../doc/superpowers/plans/2026-07-19-dotnet-runner-adapters.md)

## Projects

| Project | Role |
|---|---|
| `Varar.Core` | pure pipeline + diffs + drift/hash + conformance projections |
| `Varar` | author facade (registry glue) + the registry/plan/trace golden gates |
| `Varar.Core.Tests` | unit + conformance harness |

`Varar.Config`, `Varar.Runner`, and `Varar.TestAdapter` land in sub-project 2.

## Build & test

```sh
dotnet build Varar.sln
dotnet test  Varar.sln
```

## Environment notes (T0)

- **Target framework: `net8.0`.** The plan names `net10.0` (the eventual LTS),
  but this build environment ships only the .NET 8 SDK, so the port is pinned to
  `net8.0` (also LTS) via `global.json` + `Directory.Build.props`.
  `Cucumber.CucumberExpressions` targets `netstandard2.0`, so it runs unchanged.
- **UTF-16 offsets confirmed (no conversion layer needed).** Empirically verified
  that `Cucumber.CucumberExpressions` `20.0.0` reports match offsets as UTF-16
  code units (via .NET `Regex` group indices) — the same units the shared
  conformance goldens encode. Guarded by
  `Varar.Core.Tests/CucumberOffsetTests.cs`. This is the payoff of C# strings
  being UTF-16 like JS/JVM, and removes the Python port's riskiest work.
