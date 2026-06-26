import { EditorView } from '@codemirror/view'

// A matched step and its parameter render as one capsule: a teal step band
// (--ed-step-bg) flowing into a brown param chip (--ed-chip-bg). The function
// token is extended through the inter-token whitespace (joinStepParamTokens)
// so the two spans are DOM-adjacent; here we round only the OUTER corners and
// square the touching seam.
export const varTokenTheme = EditorView.baseTheme({
  '.cm-token-function': {
    background: 'var(--ed-step-bg)',
    color: 'var(--ed-step-text)',
    borderRadius: '4px',
    padding: '1px 5px',
  },
  '.cm-token-parameter': {
    background: 'var(--ed-chip-bg)',
    color: 'var(--ed-chip-text)',
    borderRadius: '4px',
    padding: '1px 5px',
    fontWeight: '600',
  },
  // Seam: a step immediately followed by its param squares the touching corners
  // and drops the gap so they read as one continuous highlight.
  '.cm-token-function:has(+ .cm-token-parameter)': {
    borderTopRightRadius: '0',
    borderBottomRightRadius: '0',
    paddingRight: '0',
  },
  '.cm-token-function + .cm-token-parameter': {
    borderTopLeftRadius: '0',
    borderBottomLeftRadius: '0',
  },
})
