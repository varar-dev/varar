import { markdown } from '@codemirror/lang-markdown'
import { LSPClient, languageServerExtensions } from '@codemirror/lsp-client'
import { EditorView, basicSetup } from 'codemirror'
import { workerTransport } from '../lib/worker-transport.ts'

// One shared LSP client (one worker) for the page. Phase C generalises this to
// a registry keyed by an `lsp=` attribute.
let sharedClient: LSPClient | null = null

function lspClient(): LSPClient {
  if (sharedClient) return sharedClient
  const worker = new Worker(new URL('../lib/var-worker.ts', import.meta.url), { type: 'module' })
  sharedClient = new LSPClient({ extensions: languageServerExtensions() }).connect(workerTransport(worker))
  return sharedClient
}

export function mountEditor(el: HTMLElement): EditorView {
  const doc = el.dataset.doc ?? ''
  const uri = el.dataset.uri ?? 'file:///untitled.var.md'
  const client = lspClient()
  return new EditorView({
    doc,
    extensions: [basicSetup, markdown(), client.plugin(uri)],
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
