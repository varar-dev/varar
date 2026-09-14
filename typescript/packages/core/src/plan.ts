import type { Block, Doc, Fence, SegmentOffset, Table } from './ast.ts'
import type { RowCheck } from './cell-diff.ts'
import {
  ambiguousAnchor,
  ambiguousMatch,
  type Diagnostic,
  errorFenceWithoutStep,
  referenceCycle,
  referenceEmpty,
  referenceNotFound,
} from './diagnostics.ts'
import { findHits, type Hit, resolveHits } from './matcher.ts'
import {
  type OathWorkspace,
  type Reference,
  referenceOf,
  sectionCandidates,
  sectionKey,
  slugify as slugOf,
} from './reference.ts'
import type { ParameterFormat, Registry, StepRegistration } from './registry.ts'
import { splitSentences } from './sentences.ts'
import { type Span, spanFromOffsets } from './span.ts'

export type ExecutionPlan = {
  readonly doc: Doc
  readonly examples: ReadonlyArray<PlannedExample>
  readonly diagnostics: ReadonlyArray<Diagnostic>
}

export type PlannedExample = {
  readonly name: string
  // Heading texts above this example, outer→inner. The runtime renders this
  // as a stack of `describe(...)` calls around the test.
  readonly scopeStack: ReadonlyArray<string>
  readonly span: Span
  readonly steps: ReadonlyArray<PlannedStep>
  // Present when this example is one row of a header-bound table. It describes
  // the binding paragraph above the table (shared by every row of that table)
  // so editor tooling can highlight the paragraph and its header-cell words
  // instead of the per-row table lines the executor runs against.
  readonly headerBinding?: HeaderBinding
  // Present on each row of a header-bound table: one check per column, used by
  // the executor to compare the step's returned columns against the cells.
  readonly rowChecks?: ReadonlyArray<RowCheck>
  // Set when the example carries an ```error fence: the example is
  // expected to fail. The executor inverts the outcome (a pass becomes a
  // failure). An optional message substring the actual failure must contain.
  readonly expectedOutcome?: 'fail'
  readonly expectedErrorMessage?: string
}

export type HeaderBinding = {
  // The matched-step span in the binding paragraph.
  readonly matchSpan: Span
  // One span per header cell, located where it appears in the paragraph.
  readonly paramSpans: ReadonlyArray<Span>
  // One span per header cell, located in the table's header row, so editor
  // tooling can highlight the cells themselves alongside the paragraph words.
  readonly headerCellSpans: ReadonlyArray<Span>
  readonly stepDef: StepRegistration
}

export type PlannedStep = {
  readonly text: string
  readonly matchSpan: Span
  // Set only when this step was spliced in from another oath by a reference
  // block (ADR 0016): the path of the document its spans belong to. Absent
  // means the example's own document, which is the overwhelming majority.
  readonly docPath?: string
  // Whole matched notation per parameter, incl. delimiters (e.g. quotes) —
  // used for rename and the "actual" side of a mismatch.
  readonly paramSpans: ReadonlyArray<Span>
  // The text those spans cover, sliced at plan time from the document the step
  // was written in. Consumers must use this rather than slicing the running
  // oath's source: a step spliced in by a reference block (ADR 0016) has spans
  // in a DIFFERENT document, and slicing the host source by them yields
  // whatever text happens to sit at those offsets.
  readonly paramTexts: ReadonlyArray<string>
  // The value passed to the handler per parameter (inner capture group), for
  // editor highlighting. Aligned 1:1 with `paramSpans`; equals it when the
  // parameter regexp has no capture group.
  readonly paramInnerSpans: ReadonlyArray<Span>
  readonly stepDef: StepRegistration
  readonly args: ReadonlyArray<unknown>
  // Per-argument display formatters from the matched parameter types,
  // aligned with `args`. Presentation only — see param-diff.ts.
  readonly formats: ReadonlyArray<ParameterFormat | undefined>
  readonly dataTable?: Table
  readonly docString?: {
    readonly content: string
    readonly contentType: string
    readonly span: Span
  }
}

export function plan(
  doc: Doc,
  registry: Registry,
  // Every oath in the project, plus which sections a reference block consumes
  // (ADR 0016). Required, not defaulted: a caller that has not built it would
  // otherwise silently run consumed sections as standalone examples — green,
  // and wrong. Pass emptyWorkspace() to plan a document in isolation.
  workspace: OathWorkspace,
): ExecutionPlan {
  const diagnostics: Diagnostic[] = []

  // A section another oath references stops being a standalone example: it runs
  // where it is referenced, not here.
  const consumed = (ex: Doc['examples'][number]): boolean =>
    ex.scopeStack.some((h) => workspace.referenced.has(sectionKey(doc.path, slugOf(h)))) ||
    workspace.referenced.has(sectionKey(doc.path, ''))

  // Phase 1: plan each candidate paragraph independently into a "unit".
  const units = doc.examples
    .filter((ex) => !consumed(ex))
    .map((ex) => planCandidate(ex, doc, registry, diagnostics))

  // Phase 2: group adjacent candidates into examples. A matching candidate
  // continues the open example when no delimiter (heading / `---`) precedes it;
  // otherwise it starts a new one. A non-matching candidate (prose) is a
  // delimiter: it closes the open example and is dropped. A header-bound table
  // candidate is standalone — it already emits one example per row. See ADR 0012.
  const examples: PlannedExample[] = []
  let open: MergedExample | undefined
  const flush = () => {
    if (open) examples.push(finishMerged(open, doc.source))
    open = undefined
  }
  for (const unit of units) {
    if (unit.kind === 'header-bound') {
      flush()
      examples.push(...unit.rows)
      continue
    }
    if (unit.kind === 'reference') {
      // Splice the referenced section's steps in at this position. The steps
      // join the open example (sharing its state) unless a delimiter separates
      // them, in which case this reference starts a new example — the same
      // grouping rule every other candidate follows.
      const resolved = resolveReference(unit, doc, registry, workspace, diagnostics, [])
      resolved.forEach((spliced, i) => {
        // Only the reference block itself is subject to the delimiter rule.
        // Everything it splices in belongs to the same sequence, so a section
        // of several paragraphs stays one example rather than fragmenting.
        let current: MergedExample
        if (open && (i > 0 || !unit.precededByDelimiter)) {
          mergeInto(open, spliced, true)
          current = open
        } else {
          flush()
          current = startMerged(spliced)
          // An example that OPENS with a reference is named by its own first
          // matching paragraph, not by the section it pulls in — otherwise
          // every example under a shared setup carries the same name — and it
          // sits under THIS document's headings, not the section's.
          current.nameFromReference = true
          current.scopeStack = unit.scopeStack
          current.startOffset = unit.span.startOffset
          open = current
        }
        // A spliced unit's span is in the referenced document; the example's
        // span is in this one. It ends at the reference block until a later
        // paragraph of the example's own extends it.
        current.endOffset = unit.span.endOffset
      })
      continue
    }
    if (!unit.matched) {
      // Prose paragraph — a delimiter. Drop it and end the open example.
      flush()
      continue
    }
    if (open && !unit.precededByDelimiter) {
      mergeInto(open, unit)
    } else {
      flush()
      open = startMerged(unit)
    }
  }
  flush()

  // A table or fence that doesn't attach to a step is just Markdown content,
  // not a mistake — it produces no diagnostic.

  return { doc, examples, diagnostics }
}

// Resolve one reference block into the step-bearing units of the section it
// names, recursively: a referenced section may itself contain reference blocks,
// to any depth (ADR 0016 leaves depth to the author's judgement). `chain`
// carries the sections currently being resolved so a repeat is reported as a
// cycle instead of recursing forever.
function resolveReference(
  unit: Extract<CandidateUnit, { kind: 'reference' }>,
  from: Doc,
  registry: Registry,
  workspace: OathWorkspace,
  diagnostics: Diagnostic[],
  chain: ReadonlyArray<string>,
): ReadonlyArray<Extract<CandidateUnit, { kind: 'steps' }>> {
  const { reference } = unit
  const key = sectionKey(reference.path, reference.slug)
  if (chain.includes(key)) {
    diagnostics.push(referenceCycle({ chain: [...chain, key], span: unit.span }))
    return []
  }
  // A same-file reference resolves against the document being planned, which is
  // not necessarily in the workspace (a caller may plan a document in isolation).
  const target = reference.path === from.path ? from : workspace.docs.get(reference.path)
  if (!target) {
    diagnostics.push(
      referenceNotFound({ text: reference.text, path: reference.path, span: unit.span }),
    )
    return []
  }
  // The anchor must name exactly one heading. Two headings that slug
  // identically (`## Setup` twice — GitHub's `#setup` and `#setup-1`) are
  // indistinguishable to the scope-stack rule below, which would splice both
  // sections in; that is an error, not a guess. A whole-file reference names
  // no heading, so it cannot be ambiguous.
  if (reference.slug !== '') {
    const named = target.headings.filter((h) => slugOf(h.text) === reference.slug)
    if (named.length > 1) {
      diagnostics.push(
        ambiguousAnchor({
          text: reference.text,
          path: reference.path,
          slug: reference.slug,
          headingLines: named.map((h) => h.span.startLine),
          span: unit.span,
        }),
      )
      return []
    }
  }
  const out: Array<Extract<CandidateUnit, { kind: 'steps' }>> = []
  for (const candidate of sectionCandidates(target, reference.slug)) {
    const planned = planCandidate(candidate, target, registry, diagnostics)
    if (planned.kind === 'reference') {
      out.push(
        ...resolveReference(planned, target, registry, workspace, diagnostics, [...chain, key]),
      )
      continue
    }
    // A header-bound table produces one example per row, which a spliced step
    // list cannot express; an `error` fence declares an outcome for an example,
    // not for a reusable fragment. Both are left out, and the section reads as
    // empty if that is all it held.
    if (planned.kind !== 'steps' || !planned.matched) continue
    out.push(tagWithDoc(planned, target.path, from.path))
  }
  if (out.length === 0) {
    diagnostics.push(
      referenceEmpty({
        text: reference.text,
        path: reference.path,
        slug: reference.slug,
        span: unit.span,
      }),
    )
  }
  return out
}

// Carry the source document's identity on every spliced step, so a failure in
// a referenced section reports spans against the file they were written in
// rather than the file being run.
function tagWithDoc(
  unit: Extract<CandidateUnit, { kind: 'steps' }>,
  docPath: string,
  hostPath: string,
): Extract<CandidateUnit, { kind: 'steps' }> {
  if (docPath === hostPath) return unit
  return { ...unit, steps: unit.steps.map((step) => ({ ...step, docPath })) }
}

// A step-bearing candidate accumulating into one example while adjacent matching
// candidates keep merging in.
type MergedExample = {
  name: string
  // True while the name came from a spliced (referenced) paragraph and is
  // waiting to be replaced by the example's own first matching paragraph.
  nameFromReference?: boolean
  scopeStack: ReadonlyArray<string>
  startOffset: number
  endOffset: number
  steps: PlannedStep[]
  expectedOutcome?: 'fail'
  expectedErrorMessage?: string
}

// One candidate paragraph, planned in isolation.
type CandidateUnit =
  | { readonly kind: 'header-bound'; readonly rows: ReadonlyArray<PlannedExample> }
  | {
      // A reference block: its whole text is a link to an oath section, whose
      // steps are spliced in here (ADR 0016). Never prose, so it does not close
      // the open example.
      readonly kind: 'reference'
      readonly reference: Reference
      readonly precededByDelimiter: boolean
      // The referring document's own heading chain and the block's own span:
      // an example this reference opens belongs here, not to the section.
      readonly scopeStack: ReadonlyArray<string>
      readonly span: Span
    }
  | {
      readonly kind: 'steps'
      readonly matched: boolean
      readonly precededByDelimiter: boolean
      readonly name: string
      readonly scopeStack: ReadonlyArray<string>
      readonly span: Span
      readonly steps: ReadonlyArray<PlannedStep>
      readonly expectedOutcome?: 'fail'
      readonly expectedErrorMessage?: string
    }

function startMerged(unit: Extract<CandidateUnit, { kind: 'steps' }>): MergedExample {
  return {
    name: unit.name,
    scopeStack: unit.scopeStack,
    startOffset: unit.span.startOffset,
    endOffset: unit.span.endOffset,
    steps: [...unit.steps],
    ...(unit.expectedOutcome ? { expectedOutcome: unit.expectedOutcome } : {}),
    ...(unit.expectedErrorMessage ? { expectedErrorMessage: unit.expectedErrorMessage } : {}),
  }
}

function mergeInto(
  open: MergedExample,
  unit: Extract<CandidateUnit, { kind: 'steps' }>,
  fromReference = false,
): void {
  if (open.nameFromReference && !fromReference) {
    open.name = unit.name
    open.scopeStack = unit.scopeStack
    open.nameFromReference = false
  }
  open.endOffset = unit.span.endOffset
  open.steps.push(...unit.steps)
  // Any error fence in a merged part marks the whole example expected-to-fail;
  // keep the first message we see.
  if (unit.expectedOutcome === 'fail') {
    open.expectedOutcome = 'fail'
    if (open.expectedErrorMessage === undefined && unit.expectedErrorMessage !== undefined) {
      open.expectedErrorMessage = unit.expectedErrorMessage
    }
  }
}

function finishMerged(open: MergedExample, source: string): PlannedExample {
  const span = spanFromOffsets(source, open.startOffset, open.endOffset)
  return {
    name: open.name,
    scopeStack: open.scopeStack,
    span,
    steps: open.steps,
    ...(open.expectedOutcome ? { expectedOutcome: open.expectedOutcome } : {}),
    ...(open.expectedErrorMessage ? { expectedErrorMessage: open.expectedErrorMessage } : {}),
  }
}

// Plan a single candidate paragraph (plus its attached tables/fences) in
// isolation. Emits ambiguity / error-fence diagnostics into `diagnostics`.
function planCandidate(
  ex: Doc['examples'][number],
  doc: Doc,
  registry: Registry,
  diagnostics: Diagnostic[],
): CandidateUnit {
  // A block whose whole text is a link to an oath section is a reference, not
  // content: it is never matched against step definitions, and never prose.
  const primary = ex.body[0]
  if (primary && 'text' in primary) {
    const reference = referenceOf(primary.text, doc.path)
    if (reference) {
      return {
        kind: 'reference',
        reference,
        precededByDelimiter: ex.precededByDelimiter,
        scopeStack: ex.scopeStack,
        span: ex.span,
      }
    }
  }
  let hadAmbiguous = false

  // Pass 1: plan each text-bearing block and collect steps per body index.
  const stepsByBlock = new Map<number, PlannedStep[]>()
  ex.body.forEach((block, idx) => {
    if (block.kind !== 'paragraph' && block.kind !== 'list_item' && block.kind !== 'blockquote')
      return
    const result = planBlock(block.text, registry)
    for (const collision of result.ambiguities) {
      const span = liftSpan(doc.source, block, collision.matchStart, collision.matchEnd)
      diagnostics.push(
        ambiguousMatch({
          text: block.text.slice(collision.matchStart, collision.matchEnd),
          span,
          candidates: collision.candidates.map((c) => ({
            expression: c.expression,
            sourceFile: c.stepDef.expressionSourceFile,
            sourceLine: c.stepDef.expressionSourceLine,
          })),
        }),
      )
      hadAmbiguous = true
    }
    if (!hadAmbiguous && result.steps.length > 0) {
      const blockSteps: PlannedStep[] = result.steps.map((hit) => ({
        text: block.text.slice(hit.matchStart, hit.matchEnd),
        matchSpan: liftSpan(doc.source, block, hit.matchStart, hit.matchEnd),
        paramSpans: hit.paramSpans.map((p) => liftSpan(doc.source, block, p.start, p.end)),
        paramTexts: hit.paramSpans.map((p) => block.text.slice(p.start, p.end)),
        paramInnerSpans: hit.paramInnerSpans.map((p) =>
          liftSpan(doc.source, block, p.start, p.end),
        ),
        stepDef: hit.stepDef,
        args: hit.args,
        formats: hit.formats,
      }))
      stepsByBlock.set(idx, blockSteps)
    }
  })

  // Header-bound table: a table whose every header cell is named (whole word,
  // case-sensitive) in the matched paragraph above it iterates row by row. The
  // matched step runs once per data row, receiving the row as an object keyed by
  // header cell, and each row becomes its own example.
  const bound = !hadAmbiguous ? detectHeaderBound(ex, stepsByBlock, doc.source) : null
  if (bound) {
    const headerBinding: HeaderBinding = {
      matchSpan: bound.step.matchSpan,
      paramSpans: bound.headerSpans,
      headerCellSpans: bound.table.header.cellSpans,
      stepDef: bound.step.stepDef,
    }
    const rows = bound.table.rows.map((row): PlannedExample => {
      const rowObject: Record<string, string> = {}
      bound.table.header.cells.forEach((cell, i) => {
        rowObject[cell] = row.cells[i] ?? ''
      })
      const rowStep: PlannedStep = {
        ...bound.step,
        matchSpan: row.span,
        args: [...bound.step.args, rowObject],
      }
      const rowChecks: ReadonlyArray<RowCheck> = bound.table.header.cells.map((column, i) => ({
        column,
        value: row.cells[i] ?? '',
        span: row.cellSpans[i] ?? row.span,
      }))
      return {
        name: row.cells.join(' / '),
        // Nest the rows under the binding paragraph as an extra describe scope.
        scopeStack: [...ex.scopeStack, bound.step.text],
        span: row.span,
        steps: [rowStep],
        headerBinding,
        rowChecks,
      }
    })
    return { kind: 'header-bound', rows }
  }

  // An ```error fence anywhere in this candidate marks it expected-to-fail and
  // is consumed here (never attached to a step as a doc string).
  const errorFence = ex.body.find((b): b is Fence => b.kind === 'fence' && b.info === 'error')

  // Pass 2: look for table/fence immediately after a step-bearing block.
  const attachments = new Map<
    number,
    {
      dataTable?: Table
      docString?: { readonly content: string; readonly contentType: string; readonly span: Span }
    }
  >()
  for (let idx = 1; idx < ex.body.length; idx++) {
    const here = ex.body[idx]
    if (!here) continue
    if (here.kind === 'table' && stepsByBlock.has(idx - 1)) {
      attachments.set(idx - 1, { ...(attachments.get(idx - 1) ?? {}), dataTable: here })
    } else if (here.kind === 'fence' && here.info !== 'error' && stepsByBlock.has(idx - 1)) {
      const fence = here as Fence
      attachments.set(idx - 1, {
        ...(attachments.get(idx - 1) ?? {}),
        docString: { content: fence.body, contentType: fence.info, span: fence.bodySpan },
      })
    }
  }

  // Pass 3: rebuild final step list, applying attachments to the last step of each block.
  const finalSteps: PlannedStep[] = []
  ex.body.forEach((_b, idx) => {
    const stepsAtIdx = stepsByBlock.get(idx) ?? []
    const attachAt = attachments.get(idx)
    for (let s = 0; s < stepsAtIdx.length; s++) {
      const step = stepsAtIdx[s]
      if (!step) continue
      if (s === stepsAtIdx.length - 1 && attachAt) {
        finalSteps.push({ ...step, ...attachAt })
      } else {
        finalSteps.push(step)
      }
    }
  })

  const runnableSteps = hadAmbiguous ? [] : finalSteps

  // An `error` fence declares the candidate expected-to-fail, but here there's
  // no runnable step to produce that failure (nothing matched, or the match was
  // ambiguous). That's an author mistake, not silent Markdown — flag it.
  if (errorFence && runnableSteps.length === 0) {
    diagnostics.push(errorFenceWithoutStep({ span: errorFence.span }))
  }

  return {
    kind: 'steps',
    matched: runnableSteps.length > 0,
    precededByDelimiter: ex.precededByDelimiter,
    name: deriveExampleName(ex.body),
    scopeStack: ex.scopeStack,
    span: ex.span,
    steps: runnableSteps,
    ...(errorFence
      ? {
          expectedOutcome: 'fail' as const,
          ...(errorFence.body.trim().length > 0
            ? { expectedErrorMessage: errorFence.body.trim() }
            : {}),
        }
      : {}),
  }
}

type BlockPlan = {
  readonly steps: ReadonlyArray<Hit>
  readonly ambiguities: ReadonlyArray<{
    readonly matchStart: number
    readonly matchEnd: number
    readonly candidates: ReadonlyArray<Hit>
  }>
}

// Find the first table in this example whose every header cell appears as a
// whole word (case-sensitive) in the step-bearing block immediately above it.
// Returns that table together with the step it binds to (the block's last
// matched step — the one a trailing table would otherwise attach to).
function detectHeaderBound(
  ex: { body: ReadonlyArray<Block> },
  stepsByBlock: ReadonlyMap<number, PlannedStep[]>,
  source: string,
): { table: Table; step: PlannedStep; headerSpans: ReadonlyArray<Span> } | null {
  for (let idx = 1; idx < ex.body.length; idx++) {
    const here = ex.body[idx]
    if (here?.kind !== 'table') continue
    const above = ex.body[idx - 1]
    if (
      !above ||
      (above.kind !== 'paragraph' && above.kind !== 'list_item' && above.kind !== 'blockquote')
    )
      continue
    const steps = stepsByBlock.get(idx - 1)
    if (!steps || steps.length === 0) continue
    const offsets = here.header.cells.map((cell) => wordOffset(above.text, cell))
    if (offsets.some((o) => o < 0)) continue
    const headerSpans = here.header.cells.map((cell, i) =>
      liftSpan(source, above, offsets[i] as number, (offsets[i] as number) + cell.length),
    )
    return { table: here, step: steps[steps.length - 1] as PlannedStep, headerSpans }
  }
  return null
}

// Offset of `word` in `haystack` as a whole word (case-sensitive), or -1.
function wordOffset(haystack: string, word: string): number {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const m = new RegExp(`(?<![\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])`, 'u').exec(haystack)
  return m ? m.index : -1
}

function planBlock(text: string, registry: Registry): BlockPlan {
  const allSteps: Hit[] = []
  const allAmbiguities: {
    matchStart: number
    matchEnd: number
    candidates: ReadonlyArray<Hit>
  }[] = []
  for (const sentence of splitSentences(text)) {
    const hits = findHits(sentence.text, registry)
    const adjusted = hits.map((h) => ({
      ...h,
      matchStart: h.matchStart + sentence.startOffset,
      matchEnd: h.matchEnd + sentence.startOffset,
      paramSpans: h.paramSpans.map((p) => ({
        start: p.start + sentence.startOffset,
        end: p.end + sentence.startOffset,
      })),
      paramInnerSpans: h.paramInnerSpans.map((p) => ({
        start: p.start + sentence.startOffset,
        end: p.end + sentence.startOffset,
      })),
    }))
    const resolved = resolveHits(adjusted)
    if (resolved.kind === 'ambiguous') {
      for (const c of resolved.collisions) allAmbiguities.push({ ...c })
    } else if (resolved.steps.length > 0) {
      allSteps.push(...resolved.steps)
    }
    // No keyword-led "missing step" detection — by design. Step-def
    // generation is selection-driven only, never inferred from sentence shape.
  }
  return { steps: allSteps, ambiguities: allAmbiguities }
}

export function deriveExampleName(body: ReadonlyArray<Block>): string {
  const primary = body.find(
    (b) => b.kind === 'paragraph' || b.kind === 'list_item' || b.kind === 'blockquote',
  )
  if (
    !primary ||
    (primary.kind !== 'paragraph' && primary.kind !== 'list_item' && primary.kind !== 'blockquote')
  ) {
    return ''
  }
  // The entire paragraph is the test name — an example is often a paragraph
  // where only some sentences match steps, and the narration around them is
  // part of what the test asserts about. Hard line breaks inside the
  // paragraph collapse to single spaces (test names must be one line), and a
  // single trailing . ! ? is stripped; embedded terminators (e.g. inside
  // `i.e.` or a quoted string) are left alone.
  return primary.text
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.!?]$/, '')
}

function liftSpan(source: string, block: Block, blockStart: number, blockEnd: number): Span {
  if (block.kind !== 'paragraph' && block.kind !== 'list_item' && block.kind !== 'blockquote') {
    return block.span
  }
  return liftFromSegmentMap(source, block.segmentMap, blockStart, blockEnd)
}

function liftFromSegmentMap(
  source: string,
  segmentMap: ReadonlyArray<SegmentOffset>,
  blockStart: number,
  blockEnd: number,
): Span {
  const start = liftSegmentOffset(segmentMap, blockStart)
  const end = liftSegmentOffset(segmentMap, blockEnd)
  return spanFromOffsets(source, start, end)
}

function liftSegmentOffset(segmentMap: ReadonlyArray<SegmentOffset>, textOffset: number): number {
  let best = segmentMap[0]
  for (const entry of segmentMap) {
    if (entry.textOffset <= textOffset) best = entry
  }
  if (!best) throw new Error('empty segmentMap')
  return best.sourceOffset + (textOffset - best.textOffset)
}
