import { EditorView } from '@codemirror/view'

// Mirrors <FileEditor>: matched step text underlined in accent, params as chips.
export const varTokenTheme = EditorView.baseTheme({
  '.cm-token-function': {
    textDecoration: 'underline',
    textDecorationColor: 'var(--accent)',
    textDecorationThickness: '2px',
    textUnderlineOffset: '3px',
  },
  '.cm-token-parameter': {
    background: 'var(--accent)',
    color: 'var(--ink)',
    borderRadius: '4px',
    padding: '0 2px',
  },
})
