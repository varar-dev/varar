import { RangeSetBuilder } from '@codemirror/state'
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view'
import { type LSPClientExtension, LSPPlugin } from '@codemirror/lsp-client'

export type DecodedToken = { line: number; char: number; length: number; type: string }

// Pure inverse of the LSP relative semantic-token encoding.
export function decodeSemanticTokens(
  data: ReadonlyArray<number>,
  tokenTypes: ReadonlyArray<string>,
): DecodedToken[] {
  const out: DecodedToken[] = []
  let line = 0
  let char = 0
  for (let i = 0; i + 4 < data.length; i += 5) {
    const deltaLine = data[i] as number
    const deltaChar = data[i + 1] as number
    const length = data[i + 2] as number
    const typeIndex = data[i + 3] as number
    line += deltaLine
    char = deltaLine === 0 ? char + deltaChar : deltaChar
    out.push({ line, char, length, type: tokenTypes[typeIndex] ?? String(typeIndex) })
  }
  return out
}

// Generic, server-agnostic semantic-tokens extension for @codemirror/lsp-client.
// Renders `cm-token-<type>` mark decorations; theme the classes separately.
export function semanticTokens(options: { legend: { tokenTypes: string[] } }): LSPClientExtension {
  const tokenTypes = options.legend.tokenTypes
  const plugin = ViewPlugin.fromClass(
    class {
      decorations: DecorationSet = Decoration.none
      constructor(readonly view: EditorView) {
        void this.refresh()
      }
      update(u: ViewUpdate) {
        if (u.docChanged) void this.refresh()
      }
      async refresh() {
        const lsp = LSPPlugin.get(this.view)
        if (!lsp) return
        const result = (await lsp.client.request('textDocument/semanticTokens/full', {
          textDocument: { uri: lsp.uri },
        })) as { data: number[] } | null
        if (!result) return
        const doc = this.view.state.doc
        const builder = new RangeSetBuilder<Decoration>()
        for (const t of decodeSemanticTokens(result.data, tokenTypes)) {
          if (t.line + 1 > doc.lines) continue
          const from = doc.line(t.line + 1).from + t.char
          const to = from + t.length
          if (to <= doc.length) builder.add(from, to, Decoration.mark({ class: `cm-token-${t.type}` }))
        }
        this.decorations = builder.finish()
        this.view.update([]) // nudge a redraw of the new decorations
      }
    },
    { decorations: (v) => v.decorations },
  )
  return {
    clientCapabilities: {
      textDocument: {
        semanticTokens: {
          dynamicRegistration: false,
          requests: { full: true },
          formats: ['relative'],
          tokenTypes,
          tokenModifiers: [],
        },
      },
    },
    editorExtension: plugin,
  }
}
