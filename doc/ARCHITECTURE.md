# Vár architecture (and a map for the Python port)

This document explains how the pieces of Vár fit together, and doubles as a
porting guide. The goal is to make the **seams** explicit — the small set of
pure data types and ports that everything else hangs off — so a Python port can
reproduce the same shape without re-deriving it from the TypeScript source.

> TL;DR. There are **two sides** to Vár, and they share one pure core.
>
> - **Side A — Authoring / static analysis.** Parse `.var.md` files *and* step
>   definition files, match them against each other, and produce an index.
>   Read-only, no execution. Powers the LSP, the VSCode extension, and `lint`.
> - **Side B — Running.** Import the step files (so handlers are real callables),
>   build an `ExecutionPlan`, and hand it to a **pluggable test runner** through
>   one tiny port. Powers the vitest adapter and the standalone `var run` CLI.
>
> The core (`@oselvar/var`) is pure functions over immutable data. All I/O —
> file reading, module loading, test-runner integration, editor glue — lives in
> the adapter packages and is wired in at the edges (hexagonal architecture).

---

## 1. Package map

```mermaid
graph TD
  subgraph core["Functional core — pure, no I/O"]
    VAR["@oselvar/var<br/><i>scanner · structurer · matcher<br/>registry · planner · executor<br/>diagnostics · snippet</i>"]
  end

  subgraph shared["Shared runtime glue"]
    RT["@oselvar/var-runtime<br/><i>module-scope step registry<br/>step() · defineContext()<br/>buildRegistry() · contextFactory()</i>"]
    LANG["@oselvar/var-language<br/><i>static step-def discovery<br/>buildWorkspaceIndex()</i>"]
  end

  subgraph runners["Side B — runner adapters"]
    VITEST["@oselvar/var-vitest<br/><i>vite plugin + runVarSource</i>"]
    CLI["@oselvar/var-cli<br/><i>var run / lint / stepdef / init</i>"]
  end

  subgraph authoring["Side A — authoring adapters"]
    LSP["@oselvar/var-lsp<br/><i>LSP server (pygls-shaped)</i>"]
    VSCODE["@oselvar/var-vscode<br/><i>editor extension / LSP client</i>"]
  end

  subgraph sample["Dogfood"]
    CUKE["@oselvar/cucumber<br/><i>Library sample + benchmark</i>"]
  end

  RT --> VAR
  LANG --> VAR
  VITEST --> VAR
  VITEST --> RT
  CLI --> VAR
  CLI --> RT
  LSP --> VAR
  LANG --> RT
  LSP --> LANG
  VSCODE -. "LSP/stdio" .-> LSP
  CUKE -. "benchmark vs" .-> CLI

  EXPR["@cucumber/cucumber-expressions<br/>(external)"]
  VAR --> EXPR
```

The only external domain dependency of the core is
`@cucumber/cucumber-expressions` (cucumber expression compilation + parameter
types + snippet generation). Everything else in the core is hand-rolled and
pure.

---

## 2. The two sides

This is the mental model to hold onto. Both sides feed the **same matcher and
planner** in the core; they differ only in **how they obtain the registry of
step definitions** and **what they do with the result**.

```mermaid
graph LR
  subgraph inputs["Inputs on disk"]
    MD[".var.md<br/>markdown examples"]
    STEPS[".steps.ts<br/>step definitions"]
  end

  subgraph sideA["SIDE A — Authoring / static analysis"]
    direction TB
    A_DISC["discoverStepDefs()<br/><i>parse step source, no execution</i>"]
    A_REG["Registry<br/><i>handlerless — matching only</i>"]
    A_INDEX["buildWorkspaceIndex()<br/>→ matches · diagnostics"]
    A_DISC --> A_REG --> A_INDEX
  end

  subgraph sideB["SIDE B — Running"]
    direction TB
    B_IMPORT["import step modules<br/><i>step() calls register at load</i>"]
    B_REG["Registry<br/><i>real callable handlers</i>"]
    B_PLAN["plan() → ExecutionPlan"]
    B_EXEC["executePlan(plan, ports)"]
    B_IMPORT --> B_REG --> B_PLAN --> B_EXEC
  end

  subgraph shared["Shared pure core"]
    PARSE["parse(): markdown → VarDoc AST"]
    MATCH["matcher: cucumber-expression hits"]
  end

  MD --> PARSE
  STEPS --> A_DISC
  STEPS --> B_IMPORT
  PARSE --> A_INDEX
  PARSE --> B_PLAN
  MATCH --> A_INDEX
  MATCH --> B_PLAN

  A_INDEX --> LSPOUT["LSP · VSCode · lint<br/>hover · go-to-def · completion · rename · diagnostics"]
  B_EXEC --> RUNOUT["pluggable test runner<br/>vitest · var run · (pytest · unittest)"]
```

**Why two registries?** The difference is the heart of the design:

| | Side A (static) | Side B (runtime) |
|---|---|---|
| Step files are | **parsed** as source text | **imported / executed** |
| Handlers are | absent (`EMPTY_HANDLER`) | real callables |
| Registry built by | `buildWorkspaceIndex` (`var-language`) | `buildRegistry` (`var-runtime`) |
| Used for | matching, completion, diagnostics, refactors | actually running examples |
| Side effects | none | importing user modules |

Both produce the *same* `Registry` type (compiled cucumber expressions +
parameter types), so the matcher and planner don't know or care which side
called them.

---

## 3. Side A in detail — parsing & indexing

This is the side the user described as *"the passing [parsing] of the source
files and the step definitions."* There are **two parsers** here, and they are
independent:

1. A **markdown parser** for `.var.md` (find examples, steps, tables, doc
   strings). Hand-rolled line scanner today; this is the natural home for a
   **PEG / Treetop-style grammar** in the port.
2. A **step-definition parser** for `.steps.ts` (find `step("…")` and
   `defineParameterType({…})` call sites and their handler signatures). Uses the
   **TypeScript compiler API** today; in Python this becomes the stdlib `ast`
   module.

```mermaid
graph TD
  subgraph mdpipe["Markdown pipeline (pure, @oselvar/var)"]
    SRC[".var.md source string"]
    SCAN["scan()<br/><i>line scanner + ScannerPlugin hooks</i>"]
    BLOCKS["Block[]<br/>heading · paragraph · list_item<br/>blockquote · table · fence · thematic_break"]
    STRUCT["structure()<br/><i>group blocks into Examples under heading scopes;<br/>attach trailing tables/fences</i>"]
    VARDOC["VarDoc<br/><i>examples + orphanAttachments</i>"]
    SRC --> SCAN --> BLOCKS --> STRUCT --> VARDOC
  end

  subgraph plugins["Opt-in ScannerPlugins"]
    GT["gherkinTables()"]
    GD["gherkinDocStrings()"]
  end
  plugins -.->|"injected before built-ins"| SCAN

  subgraph stepdisc["Step-def discovery (@oselvar/var-language)"]
    STEPSRC[".steps.ts source string"]
    SCANNER["StepDefScanner port<br/><i>createTypeScriptScanner()</i>"]
    DEFS["StepDef[] · ParameterTypeDef[]<br/><i>expression + ranges + handler params</i>"]
    STEPSRC --> SCANNER --> DEFS
  end

  subgraph index["buildWorkspaceIndex()"]
    REG["Registry<br/><i>params first, then steps (handlerless)</i>"]
    PLAN1["plan(VarDoc, Registry) per file"]
    WIDX["WorkspaceIndex<br/>stepDefs · matches · diagnostics · registry"]
  end

  DEFS --> REG
  VARDOC --> PLAN1
  REG --> PLAN1
  PLAN1 --> WIDX

  WIDX --> CONSUMERS["LSP handlers:<br/>hover · definition · completion<br/>semantic tokens · rename · diagnostics"]
```

Key types along this path (all `readonly`/immutable):

- `Block` → `Example` → `VarDoc` (`ast.ts`). Spans carry source offsets +
  line/col so editors can map matches back to exact ranges. `inlineMap` records
  how stripped inline markdown (backticks, emphasis) maps back to raw source
  offsets — essential for accurate highlight/rename ranges.
- `StepDef` / `ParameterTypeDef` (`var-language/step-defs.ts`) — the static view
  of a step file, including the handler's parameter list (for signature sync on
  rename).
- `WorkspaceIndex` (`var-language/index-workspace.ts`) — the single artifact the
  whole authoring side reads from.

The LSP wraps this in a `Store` (re-indexes on change) behind a `FileSystem`
port; the VSCode extension is a thin LSP client plus a couple of commands.

---

## 4. Side B in detail — running

This is *"the runner, which needs to be pluggable into any test runner."* The
crucial design point the user raised — *"a generic instruction API to run the
files, consistent across platforms but pluggable into whatever test runners are
available"* — is satisfied by **one immutable data structure plus one port**:

- The **instruction API** is the `ExecutionPlan` (pure data: examples → steps →
  resolved handler + args + attachments).
- The **plug point** is `TestSink.example(name, run)` — the *only* thing a
  runner adapter must implement. `executePlan` walks the plan and calls
  `sink.example(...)` once per example; the adapter decides what that means
  (a vitest `test()`, a pytest item, a queued closure, …).

```mermaid
graph TD
  subgraph load["Load step files (adapter shell — side effects OK)"]
    IMP["import each *.steps.ts<br/><i>runs step()/defineContext()/defineParameterType()</i>"]
    MODREG["@oselvar/var-runtime module-scope state<br/><i>steps[] · contextFactories · customTypes</i>"]
    IMP --> MODREG
  end

  subgraph buildrun["runVarSource() — the generic run entry"]
    PARSE2["parse(source) → VarDoc"]
    BREG["buildRegistry() → Registry<br/><i>real handlers</i>"]
    PLAN2["plan(VarDoc, Registry) → ExecutionPlan"]
    EXEC["executePlan(plan, ports)"]
    PARSE2 --> EXEC
    BREG --> PLAN2 --> EXEC
  end

  MODREG --> BREG

  subgraph ports["Ports — implemented by the adapter"]
    SINK["TestSink.example(name, run)"]
    REP["Reporter.diagnostic(d)"]
    CTX["createContext(stepFile)"]
  end
  EXEC --> SINK
  EXEC --> REP
  EXEC --> CTX

  subgraph adapters["Concrete runner adapters"]
    V["vitest: example → vitestTest(name, run)"]
    C["var run: example → queue.push; run sequentially"]
    P["pytest (port): example → collected test item"]
  end
  SINK --> V
  SINK --> C
  SINK --> P
```

Inside `executePlan` (see `execute.ts`):

- Each example becomes one `sink.example(name, asyncRun)`. The `asyncRun`
  closure runs the example's steps **in order**, awaiting each handler.
- **Context lifetime:** one context object **per stepfile per example**, created
  lazily via `createContext(stepFile)` on first use and shared by subsequent
  steps from that same stepfile. Different stepfiles get different contexts;
  different examples never share. This is how state is isolated without
  lifecycle hooks.
- **Attachments:** a trailing data table arrives as the last handler arg as
  `string[][]` (header row first); a doc string arrives as a plain string.
- **Diagnostics** (ambiguous match, orphan attachment) are pushed to
  `reporter.diagnostic` before any example runs.
- **Clickable failures:** on a thrown error, a synthetic stack frame pointing at
  the matched step's `file:line:col` in the `.var.md` is spliced in, so
  terminals render a cmd-clickable link.

The vitest adapter adds one more layer: a **vite plugin** turns every `.var.md`
into a virtual module that imports the step files and calls `runVarSource`. In
the port this is exactly the role a **pytest collection hook** plays — see §7.

---

## 5. Hexagonal view — ports & adapters

Everything that touches the outside world is a port implemented at the edge. A
porter's checklist is "implement these six ports for the target platform."

```mermaid
graph TB
  subgraph hex["Core domain (@oselvar/var) — pure"]
    DOM["scan · structure · match · plan · executePlan<br/>diagnostics · snippet generation"]
  end

  subgraph portsdef["Ports (interfaces the core/edges depend on)"]
    P1["TestSink<br/><i>example(name, run)</i>"]
    P2["Reporter<br/><i>diagnostic(d)</i>"]
    P3["createContext<br/><i>(stepFile) → ctx</i>"]
    P4["ScannerPlugin<br/><i>tryScan(...) → Block</i>"]
    P5["StepDefScanner<br/><i>discoverStepDefs / ParameterTypes</i>"]
    P6["FileSystem<br/><i>list / read / write</i>"]
  end

  DOM --- P1 & P2 & P3 & P4 & P5 & P6

  subgraph adps["Adapters (implement ports)"]
    AD1["vitest test() / var-run queue / pytest item"]
    AD2["vitest failing test / stderr writer / LSP push"]
    AD3["per-stepfile defineContext() factory"]
    AD4["gherkinTables() · gherkinDocStrings()"]
    AD5["TypeScript compiler API → Python ast"]
    AD6["node:fs (CLI/LSP) · in-memory (tests)"]
  end

  P1 --> AD1
  P2 --> AD2
  P3 --> AD3
  P4 --> AD4
  P5 --> AD5
  P6 --> AD6
```

| Port | Defined in | Implemented by | Port-side responsibility |
|---|---|---|---|
| `TestSink` | `var/ports.ts` | vitest, `var run`, (pytest) | turn an example into a runner test |
| `Reporter` | `var/ports.ts` | vitest, CLI stderr, LSP | surface diagnostics |
| `createContext` | `var/execute.ts` (`ExecutePorts`) | `var-runtime` contextFactory | per-stepfile state factory |
| `ScannerPlugin` | `var/scanner.ts` | gherkin plugins (core, opt-in) | recognise extra block shapes |
| `StepDefScanner` | `var-language/scanner.ts` | TS compiler scanner | parse step source → `StepDef[]` |
| `FileSystem` | `var-lsp/file-system.ts` | node-fs, in-memory test fs | list/read/write source files |

---

## 6. Data model (the immutable contracts to reproduce)

These are the types a port must reproduce faithfully — they are the wire format
between stages. All fields are `readonly`; updates produce new values.

```mermaid
classDiagram
  class VarDoc {
    path: string
    source: string
    examples: Example[]
    orphanAttachments: (Table|Fence)[]
  }
  class Example {
    scopeStack: string[]
    span: Span
    body: Block[]
  }
  class Registry {
    steps: StepRegistration[]
    parameterTypes: ParameterTypeRegistry
  }
  class StepRegistration {
    expression: string
    expressionSourceFile: string
    expressionSourceLine: number
    handler: StepHandler
    compiled: CucumberExpression
  }
  class ExecutionPlan {
    varDoc: VarDoc
    examples: PlannedExample[]
    diagnostics: Diagnostic[]
  }
  class PlannedExample {
    name: string
    scopeStack: string[]
    span: Span
    steps: PlannedStep[]
  }
  class PlannedStep {
    text: string
    matchSpan: Span
    paramSpans: Span[]
    stepDef: StepRegistration
    args: unknown[]
    dataTable?: Table
    docString?: DocString
  }

  VarDoc "1" --> "*" Example
  ExecutionPlan "1" --> "*" PlannedExample
  ExecutionPlan --> VarDoc
  PlannedExample "1" --> "*" PlannedStep
  PlannedStep --> StepRegistration
  Registry "1" --> "*" StepRegistration
```

`plan(VarDoc, Registry) → ExecutionPlan` is the join: it runs the matcher per
text block, resolves overlaps/ambiguities, attaches trailing tables/fences to
the last matched step, derives each example's name from its first sentence, and
collects diagnostics. It is pure — same inputs, same plan.

---

## 7. Porting to Python

The architecture is deliberately language-agnostic: pure core + ports. The port
keeps the **same stages, the same immutable types, and the same two-sided
split**; only the adapters change.

```mermaid
graph TD
  subgraph pycore["var (pure) — port of @oselvar/var"]
    PS["scanner / structurer (markdown → VarDoc)"]
    PM["matcher (cucumber-expressions for Python)"]
    PP["planner / executor / diagnostics / snippet"]
  end
  subgraph pyglue["runtime glue"]
    PRT["var.runtime<br/>@step / define_context / define_parameter_type<br/>build_registry()"]
    PLANG["var.language<br/>discover_step_defs via stdlib ast<br/>build_workspace_index()"]
  end
  subgraph pyrun["runner adapters"]
    PPLUG["pytest plugin<br/>pytest_collect_file: *.var.md → items"]
    PCLI["var run CLI<br/>own TestSink"]
  end
  subgraph pyauth["authoring adapters"]
    PLSP["LSP server via pygls"]
    PEXT["VSCode extension (stays TS) → talks to Python LSP"]
  end
  PRT --> pycore
  PLANG --> pycore
  PPLUG --> pycore
  PPLUG --> PRT
  PCLI --> pycore
  PCLI --> PRT
  PLSP --> PLANG
  PEXT -. stdio .-> PLSP
```

### Tooling translation

| Concern | TypeScript today | Python port |
|---|---|---|
| Cucumber expressions | `@cucumber/cucumber-expressions` | `cucumber-expressions` (official PyPI package) |
| **Markdown parse** (`.var.md`) | hand-rolled line scanner in `scanner.ts` | PEG grammar — **Treetop-style** via `parsimonious`/`lark`, or port the line scanner verbatim. `ScannerPlugin` → grammar extension / pre-rule hook |
| **Step-def parse** (`.steps.py`) | TypeScript compiler API (`StepDefScanner`) | stdlib **`ast`** module: walk for `step("…")` / `define_parameter_type(...)` calls and decorator/handler signatures. Same `StepDefScanner` port shape |
| Module-scope registration | `var-runtime` mutable module state | a registry module; `@step("…")` **decorator** registers at import — a natural fit for Python |
| Per-stepfile context | `defineContext()` factory map | `define_context()` returning a typed `step`, keyed by module |
| Runner plug point | `TestSink.example` → `vitestTest` | `TestSink.example` → **pytest** collected item (`pytest_collect_file` / `pytest_pycollect_makeitem`) or `unittest` test |
| Per-`.var.md` wiring | vite virtual module | **pytest collection hook** turns each `.var.md` into a test file/module |
| File access | `node:fs` / in-memory | `pathlib` / in-memory `FileSystem` port |
| LSP server | `vscode-languageserver` | **`pygls`** |
| Editor extension | `@oselvar/var-vscode` | keep the TS extension; point its `serverModule` at the Python LSP |

### A note on "Treetop" / the two parsers

The user's instruction — *use Treetop for the parsing* — applies to the
**markdown side** (recognising examples, steps, tables, doc strings as a
grammar). Treetop itself is a Ruby PEG library; the Python equivalents are
`parsimonious`, `lark`, or `pyparsing`. The **step-definition side is a separate
parser** and should **not** use a text grammar — it parses real Python source,
so use the stdlib `ast` module (the analogue of today's TypeScript compiler
API). Keeping these two parsers behind their existing seams (`ScannerPlugin`
for markdown, `StepDefScanner` for step source) means each can evolve
independently.

### Suggested port order

1. **Core types + markdown parser** (`scan`/`structure` → `VarDoc`). Pure;
   easiest to test in isolation against the existing `.var.md` fixtures.
2. **Registry + matcher + planner** on top of `cucumber-expressions`. This
   unlocks both sides.
3. **Side B runtime**: `@step` decorator registry + `build_registry` +
   `execute_plan` with an in-memory `TestSink`; then the `var run` CLI.
4. **pytest adapter**: `TestSink` → collected items via a collection hook.
5. **Side A**: `discover_step_defs` (stdlib `ast`) + `build_workspace_index`.
6. **LSP** via `pygls`, reusing the existing VSCode extension.

Stages 1–3 give a runnable tool; 4 makes it idiomatic on the platform; 5–6 add
the authoring experience.
