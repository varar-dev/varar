import { EditorSelection, StateEffect, StateField, type ChangeSpec, type EditorState, type Extension, type TransactionSpec } from '@codemirror/state'
import { Decoration, EditorView, ViewPlugin, type DecorationSet, type ViewUpdate } from '@codemirror/view'

// Pure: compute the change that appends `fullCode` to the end of `stepsDoc`,
// separated from existing content by exactly one blank line, with a trailing
// newline. Returns the change plus the [from, to) offsets of the inserted
// block in the resulting document.
export function appendStepDef(
  stepsDoc: string,
  fullCode: string,
): { changes: ChangeSpec; from: number; to: number } {
  const block = fullCode.trim()
  const body = stepsDoc.replace(/\s*$/, '') // existing content without trailing whitespace
  if (body.length === 0) {
    return { changes: { from: 0, to: stepsDoc.length, insert: `${block}\n` }, from: 0, to: block.length }
  }
  const insert = `\n\n${block}\n`
  const from = body.length + 2
  return { changes: { from: body.length, to: stepsDoc.length, insert }, from, to: from + block.length }
}

// A subset of EditorView this module needs — so the orchestration can be
// driven headlessly (an EditorState plus a capturing dispatch) in node tests.
export type EditorLike = {
  state: EditorState
  dispatch: (tr: TransactionSpec) => void
  focus?: () => void
}

export type GenerateSnippet = (text: string) => Promise<{ fullCode: string; expression: string }>

// Carries the range to flash after an insert (null clears it).
export const flashRange = StateEffect.define<{ from: number; to: number } | null>()

export async function runGenerateStepDef(opts: {
  specView: EditorLike
  stepsView: EditorLike
  generate: GenerateSnippet
}): Promise<{ from: number; to: number; expression: string } | null> {
  const sel = opts.specView.state.selection.main
  if (sel.empty) return null
  const text = opts.specView.state.sliceDoc(sel.from, sel.to)
  const { fullCode, expression } = await opts.generate(text)
  const { changes, from, to } = appendStepDef(opts.stepsView.state.doc.toString(), fullCode)
  opts.stepsView.dispatch({
    changes,
    selection: EditorSelection.range(from, to),
    effects: flashRange.of({ from, to }),
    scrollIntoView: true,
  })
  opts.stepsView.focus?.()
  return { from, to, expression }
}

const flashMark = Decoration.mark({ class: 'cm-stepgen-flash' })

export const flashField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    deco = deco.map(tr.changes)
    for (const e of tr.effects) {
      if (e.is(flashRange)) {
        deco = e.value ? Decoration.set([flashMark.range(e.value.from, e.value.to)]) : Decoration.none
      }
    }
    return deco
  },
  provide: (f) => EditorView.decorations.from(f),
})

// Clears the flash ~600ms after it is set (view-layer; uses window timers).
const flashClearPlugin = ViewPlugin.fromClass(
  class {
    timer: ReturnType<typeof setTimeout> | undefined
    constructor(readonly view: EditorView) {}
    update(u: ViewUpdate): void {
      for (const tr of u.transactions) {
        for (const e of tr.effects) {
          if (e.is(flashRange) && e.value) {
            clearTimeout(this.timer)
            this.timer = setTimeout(() => this.view.dispatch({ effects: flashRange.of(null) }), 600)
          }
        }
      }
    }
    destroy(): void {
      clearTimeout(this.timer)
    }
  },
)

const flashTheme = EditorView.baseTheme({
  '.cm-stepgen-flash': {
    backgroundColor: 'rgba(255, 46, 136, 0.28)',
    transition: 'background-color 0.4s ease',
  },
})

export function flashExtension(): Extension {
  return [flashField, flashClearPlugin, flashTheme]
}
