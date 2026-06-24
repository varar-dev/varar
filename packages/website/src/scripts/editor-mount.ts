import { javascript } from '@codemirror/lang-javascript'
import { markdown } from '@codemirror/lang-markdown'
import { LSPClient, languageServerExtensions } from '@codemirror/lsp-client'
import { EditorView, basicSetup } from 'codemirror'
import { semanticTokens } from '../lib/cm-semantic-tokens.ts'
import { varTokenTheme } from '../lib/var-token-theme.ts'
import { workerTransport } from '../lib/worker-transport.ts'

// One shared LSP client (one worker) for the page. Phase C generalises this to
// a registry keyed by an `lsp=` attribute.
let sharedClient: LSPClient | null = null

function lspClient(): LSPClient {
  if (sharedClient) return sharedClient
  const worker = new Worker(new URL('../lib/var-worker.ts', import.meta.url), { type: 'module' })
  sharedClient = new LSPClient({
    extensions: [
      ...languageServerExtensions(),
      semanticTokens({ legend: { tokenTypes: ['function', 'parameter'] } }),
    ],
  }).connect(workerTransport(worker))
  return sharedClient
}

export function mountEditor(el: HTMLElement): EditorView {
  const doc = el.dataset.doc ?? ''
  const uri = el.dataset.uri ?? 'file:///untitled.var.md'
  const lang = el.dataset.lang ?? 'markdown'
  const language = lang === 'typescript' ? javascript({ typescript: true }) : markdown()
  const client = lspClient()
  return new EditorView({
    doc,
    extensions: [basicSetup, language, varTokenTheme, client.plugin(uri)],
    parent: el,
  })
}

function mountAll(): void {
  for (const el of document.querySelectorAll<HTMLElement>('.cm-mount')) {
    if (el.dataset.mounted) continue
    el.dataset.mounted = 'true'
    mountEditor(el)
  }
}

mountAll()
