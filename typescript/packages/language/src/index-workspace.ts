import {
  addStep,
  buildWorkspace,
  createRegistry,
  type Doc,
  defineParameterType,
  type ExecutionPlan,
  hashSource,
  type OathWorkspace,
  parse,
  plan,
  type Registry,
} from '@varar/core'
import type { StepDefScanner } from './scanner.ts'
import type { Range, StepDef } from './step-defs.ts'

// Memoisation across reindexes. The LSP rebuilds the whole workspace index on
// every change (see createStore), so without this a keystroke re-runs the
// tree-sitter scan on every step file and re-parses and re-plans every oath.
// Everything cached here is a pure function of a file's content, keyed by
// (path, content hash) — a stale entry is impossible, and an unbounded cache is
// bounded in practice by the number of file versions a session sees. Pass the
// same cache object to every call; omit it for a one-shot index.
export type IndexCache = {
  readonly steps: Map<string, ScannedSteps>
  readonly docs: Map<string, Doc>
  readonly plans: Map<string, PlannedOath>
}

type ScannedSteps = {
  readonly parameterTypes: ReadonlyArray<{ readonly name: string; readonly regexp: string }>
  readonly stepDefs: ReadonlyArray<StepDef>
}

export type PlannedOath = {
  readonly doc: Doc
  readonly plan: ExecutionPlan
  readonly matches: ReadonlyArray<MatchRef>
  readonly diagnostics: ReadonlyArray<DiagnosticRef>
}

export function createIndexCache(): IndexCache {
  return { steps: new Map(), docs: new Map(), plans: new Map() }
}

// A file version's cache key. hashSource is the same FNV-1a every port uses for
// drift baselines, so it is already a dependency and already fast.
function versionKey(path: string, source: string): string {
  return `${path}\u0000${hashSource(source)}`
}

export type WorkspaceInput = {
  readonly stepFiles: ReadonlyArray<{ readonly path: string; readonly source: string }>
  readonly oathFiles: ReadonlyArray<{ readonly path: string; readonly source: string }>
  // The step-def scanner. Always the tree-sitter scanner
  // (createTreeSitterScanner); callers build it at their async shell edge with
  // an environment-specific GrammarLoader and pass the resolved instance here.
  readonly scanner: StepDefScanner
}

export type MatchRef = {
  readonly oathPath: string
  readonly range: Range
  // The range of the value passed to the handler for each parameter — the
  // inner capture group, e.g. `world` for `{string}` matching `"world"` (the
  // quotes are excluded). What editors highlight. Same order as the cucumber
  // expression's parameter list.
  readonly paramRanges: ReadonlyArray<Range>
  // The full matched notation for each parameter, incl. delimiters (e.g. the
  // quotes), sliced from the .md source at index time. Same order as
  // `paramRanges` but a wider span. Used by the rename refactor to preserve
  // values verbatim across expressions whose parameter list survives the edit.
  readonly paramValues: ReadonlyArray<string>
  // Present only on header-binding matches: one range per header cell, located
  // in the table's header row. Kept separate from `paramRanges` because that
  // array must stay aligned 1:1 with the expression's parameter list (rename
  // relies on it). Editors paint these as parameters too.
  readonly headerCellRanges?: ReadonlyArray<Range>
  readonly stepDef: StepDef
}

export type DiagnosticRef = {
  readonly oathPath: string
  readonly code: string
  readonly severity: 'error' | 'warning'
  readonly message: string
  readonly range: Range
}

export type WorkspaceIndex = {
  readonly stepDefs: ReadonlyArray<StepDef>
  readonly matches: ReadonlyArray<MatchRef>
  readonly diagnostics: ReadonlyArray<DiagnosticRef>
  // The fully-populated registry (step defs + custom parameter types) so
  // downstream tools — snippet generation, completion, etc. — can use the
  // same view the matcher used.
  readonly registry: Registry
  // The reference topology the plans were built against (ADR 0016), so a
  // caller that re-plans one document — the LSP accepting drift — plans it the
  // way the index did rather than as if it stood alone.
  readonly workspace: OathWorkspace
  // Every oath's parsed document and execution plan, keyed by the path it was
  // indexed under. Exposed so a caller that needs the same plan — the LSP's
  // drift pass — reuses this one instead of parsing and planning a second time.
  readonly oaths: ReadonlyMap<string, PlannedOath>
}

const EMPTY_HANDLER = (): void => {}

export function buildWorkspaceIndex(input: WorkspaceInput, cache?: IndexCache): WorkspaceIndex {
  const scanner = input.scanner
  const stepDefs: StepDef[] = []
  let registry = createRegistry()

  // Scan each step file once — the tree-sitter parse is the most expensive
  // thing in a reindex, and a cached hit makes an oath-only edit cost nothing
  // here at all.
  const scanned = input.stepFiles.map((file) => {
    const key = versionKey(file.path, file.source)
    const hit = cache?.steps.get(key)
    if (hit) return hit
    const fresh: ScannedSteps = {
      parameterTypes: scanner.discoverParameterTypes(file.path, file.source),
      stepDefs: scanner.discoverStepDefs(file.path, file.source),
    }
    cache?.steps.set(key, fresh)
    return fresh
  })

  // The registry's identity: when it changes, every cached plan is stale, since
  // which paragraphs are examples depends on the step definitions.
  const registryKey = hashSource(
    input.stepFiles.map((f) => versionKey(f.path, f.source)).join('\n'),
  )

  // First pass: register every custom parameter type. We need them in place
  // before compiling any step expressions, otherwise a `step('I fly to {airport}')`
  // discovered in the same file would fail with UndefinedParameterTypeError.
  for (const file of scanned) {
    for (const pt of file.parameterTypes) {
      try {
        registry = defineParameterType(registry, {
          name: pt.name,
          regexp: pt.regexp,
        })
      } catch {
        // Duplicate parameter type or invalid regex; ignore at index time.
      }
    }
  }

  for (const file of scanned) {
    const defs = file.stepDefs
    for (const def of defs) {
      stepDefs.push(def)
      try {
        registry = addStep(registry, {
          expression: def.expression,
          expressionSourceFile: def.file,
          expressionSourceLine: def.expressionRange.start.line,
          kind: def.kind,
          handler: EMPTY_HANDLER,
        })
      } catch {
        // duplicate step definition or unknown parameter type — surface as a
        // diagnostic in a future iteration.
      }
    }
  }

  const matches: MatchRef[] = []
  const seenMatches = new Set<string>()
  const diagnostics: DiagnosticRef[] = []
  const oaths = new Map<string, PlannedOath>()

  // Parse every oath before planning any: whether a section is a standalone
  // example depends on whether another oath references it, which is
  // whole-project knowledge (ADR 0016).
  const docs = input.oathFiles.map((file) => {
    const docKey = versionKey(file.path, file.source)
    let doc = cache?.docs.get(docKey)
    if (!doc) {
      doc = parse(file.path, file.source)
      cache?.docs.set(docKey, doc)
    }
    return { file, docKey, doc }
  })
  const workspace = buildWorkspace(docs.map((d) => d.doc))
  // A plan depends on the reference topology and on the content of the
  // documents that topology reaches — and on nothing else in the workspace, so
  // a project without references (the common case) keeps per-file caching
  // exact, and one with references invalidates conservatively.
  const workspaceKey = hashSource(
    [
      ...[...workspace.referenced].sort(),
      ...docs
        .filter((d) => referencedPaths(workspace).has(d.doc.path))
        .map((d) => d.docKey)
        .sort(),
    ].join('\n'),
  )

  for (const { file, docKey, doc } of docs) {
    // Parse is pure in the source, so it is cached by content alone; the plan
    // and everything derived from it also depend on the registry and on the
    // project's reference topology.
    const planKey = `${docKey}\u0000${registryKey}\u0000${workspaceKey}`
    const cached = cache?.plans.get(planKey)
    if (cached) {
      oaths.set(file.path, cached)
      addMatches(cached.matches)
      diagnostics.push(...cached.diagnostics)
      continue
    }
    const result = plan(doc, registry, workspace)
    const fileMatches: MatchRef[] = []
    const fileDiagnostics: DiagnosticRef[] = []
    // Header-bound tables expand to one example per row, all sharing the same
    // binding paragraph. For highlighting we want the paragraph (with its
    // header-cell words as parameters) once — not the per-row table lines the
    // executor runs against. Dedupe by the paragraph's start position.
    const seenBindings = new Set<string>()
    for (const ex of result.examples) {
      if (ex.headerBinding) {
        const b = ex.headerBinding
        const key = `${b.matchSpan.startLine}:${b.matchSpan.startCol}`
        if (seenBindings.has(key)) continue
        seenBindings.add(key)
        const def = stepDefs.find(
          (d) => d.expression === b.stepDef.expression && d.file === b.stepDef.expressionSourceFile,
        )
        if (!def) continue
        fileMatches.push({
          oathPath: file.path,
          range: toRange(b.matchSpan),
          paramRanges: b.paramSpans.map(toRange),
          paramValues: b.paramSpans.map((s) => file.source.slice(s.startOffset, s.endOffset)),
          headerCellRanges: b.headerCellSpans.map(toRange),
          stepDef: def,
        })
        continue
      }
      for (const step of ex.steps) {
        const def = stepDefs.find(
          (d) =>
            d.expression === step.stepDef.expression &&
            d.file === step.stepDef.expressionSourceFile,
        )
        if (!def) continue
        fileMatches.push({
          // A step a reference block spliced in from another oath (ADR 0016)
          // is labelled with THAT oath: its ranges address that file, and the
          // editor looks matches up by path to highlight them and to build
          // the URI it navigates to.
          oathPath: step.docPath ?? file.path,
          range: toRange(step.matchSpan),
          // Highlight only the value passed to the handler (inner capture
          // group); paramValues keeps the full notation for rename.
          paramRanges: step.paramInnerSpans.map(toRange),
          // From the step's own document — a step spliced in by a reference
          // block has spans in another file, which this source cannot slice.
          paramValues: step.paramTexts,
          stepDef: def,
        })
      }
    }
    for (const d of result.diagnostics) {
      fileDiagnostics.push({
        oathPath: file.path,
        code: d.code,
        severity: d.severity,
        message: d.message,
        range: toRange(d.span),
      })
    }
    const planned: PlannedOath = {
      doc,
      plan: result,
      matches: fileMatches,
      diagnostics: fileDiagnostics,
    }
    cache?.plans.set(planKey, planned)
    oaths.set(file.path, planned)
    addMatches(fileMatches)
    diagnostics.push(...fileDiagnostics)
  }

  return { stepDefs, matches, diagnostics, registry, workspace, oaths }

  // A section two oaths reference is planned once per referrer, so its matches
  // arrive once per referrer too. The site is the same; keep one.
  function addMatches(list: ReadonlyArray<MatchRef>): void {
    for (const m of list) {
      const key = [
        m.oathPath,
        m.range.start.line,
        m.range.start.character,
        m.range.end.line,
        m.range.end.character,
        m.stepDef.file,
        m.stepDef.expression,
      ].join(' ')
      if (seenMatches.has(key)) continue
      seenMatches.add(key)
      matches.push(m)
    }
  }
}

type SpanLike = {
  readonly startLine: number
  readonly startCol: number
  readonly endLine: number
  readonly endCol: number
}

function toRange(span: SpanLike): Range {
  return {
    start: { line: span.startLine, character: span.startCol },
    end: { line: span.endLine, character: span.endCol },
  }
}

// The paths a reference points at, so cache invalidation can ignore every
// document that takes no part in the reference graph.
function referencedPaths(workspace: ReturnType<typeof buildWorkspace>): ReadonlySet<string> {
  const out = new Set<string>()
  for (const key of workspace.referenced) {
    const hash = key.lastIndexOf('#')
    out.add(hash === -1 ? key : key.slice(0, hash))
  }
  return out
}
