import {
  type CodeAction,
  CodeActionKind,
  type Connection,
  type Diagnostic,
  InsertTextFormat,
  type LocationLink,
  TextDocumentSyncKind,
  TextDocuments,
} from 'vscode-languageserver'
import { TextDocument } from 'vscode-languageserver-textdocument'
import { buildHandlers } from './handlers.ts'
import { createRunResultsStore, type LspDiagnostic, runLspDiagnostics } from './run-results.ts'
import { SEMANTIC_LEGEND, semanticTokenData } from './semantic-tokens.ts'
import { createStore, type Store, type StoreDeps } from './store.ts'
import { uriToPath } from './uri.ts'

// FileSystem is the port external adapters implement (node-file-system.ts
// internally, idb-file-system.ts in the website packages) — it must be
// public for those adapters to type against it.
export type { FileSystem } from './file-system.ts'

// vscode-languageserver 10's `onRequest(method, handler)` overload mis-infers the
// result generic from a discriminated `{ ok: true } | { ok: false }` union (it
// drops the failure arm). Pin the generic explicitly from each handler's own
// return type so the result type round-trips correctly.
type LspHandlers = NonNullable<ReturnType<typeof buildHandlers>>

export function registerHandlers(
  connection: Connection,
  makeDeps: (rootUri?: string) => Promise<StoreDeps>,
  opts?: { onDidChangeDocument?: (uri: string, text: string) => void | Promise<void> },
): void {
  let store: Store | null = null
  let handlers: ReturnType<typeof buildHandlers> | null = null
  let runResults: ReturnType<typeof createRunResultsStore> | null = null
  // Track in-memory document content so completion + future cursor-aware
  // features can read the current line without going back to disk.
  const documents = new TextDocuments(TextDocument)
  documents.listen(connection)

  connection.onInitialize(async (params) => {
    const root = params.workspaceFolders?.[0]?.uri
    store = createStore(await makeDeps(root))
    handlers = buildHandlers(store)
    await store.reindex()
    runResults = createRunResultsStore(root ?? '')
    const varJsonPaths = await store.fs().list({ include: ['**/.varar/**/*.json'], exclude: [] })
    for (const p of varJsonPaths) {
      try {
        runResults.ingest(p, await store.fs().read(p))
      } catch {
        // a .varar file that vanished between list and read — ignore
      }
    }
    afterReindex()
    return {
      capabilities: {
        textDocumentSync: TextDocumentSyncKind.Incremental,
        hoverProvider: true,
        definitionProvider: true,
        // No triggerCharacters — we want the suggestions to appear via the
        // user's invocation (Ctrl+Space) and as they type letters.
        completionProvider: { resolveProvider: false },
        // "Accept as prose" on a drift diagnostic, executed via a server command.
        codeActionProvider: { codeActionKinds: [CodeActionKind.QuickFix] },
        executeCommandProvider: { commands: ['varar.acceptDrift'] },
        semanticTokensProvider: {
          legend: {
            tokenTypes: [...SEMANTIC_LEGEND.tokenTypes],
            tokenModifiers: [...SEMANTIC_LEGEND.tokenModifiers],
          },
          full: true,
        },
      },
    }
  })

  // Reindexing is whole-workspace, so a burst of keystrokes must not queue one
  // per character. The buffer is written through immediately — the filesystem
  // is the source of truth and stays current — and only the derived index is
  // debounced. Every request handler awaits `settled()` first, so no feature
  // can observe an index older than the edit it is answering about.
  const REINDEX_DEBOUNCE_MS = 75
  let debounceTimer: ReturnType<typeof setTimeout> | undefined
  let dirty = false
  // Reindexes are serialised through this chain: store.reindex() is async, and
  // two overlapping runs would race to assign the index.
  let inFlight: Promise<void> = Promise.resolve()
  // Write-throughs are serialised too: two edits in quick succession are two
  // async writes of the same file, and the earlier one finishing last would
  // leave the older text on disk for the reindex to read.
  let writes: Promise<void> = Promise.resolve()

  function scheduleReindex(): void {
    dirty = true
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      void settled()
    }, REINDEX_DEBOUNCE_MS)
  }

  // Run any pending reindex now and wait for it (plus whatever was already in
  // flight). Safe to call when nothing is pending: it awaits the current chain.
  function settled(): Promise<void> {
    if (debounceTimer) {
      clearTimeout(debounceTimer)
      debounceTimer = undefined
    }
    if (!dirty) return inFlight
    dirty = false
    inFlight = inFlight.then(async () => {
      // Every write queued before this reindex lands first, so the index is
      // never built from a file older than the edit it answers about.
      await writes
      if (!store) return
      await store.reindex()
      afterReindex()
    })
    return inFlight
  }

  // Write-through: persist edited docs to the FileSystem, then reindex
  // (debounced). The reindex is scheduled at once — marking the index dirty
  // before the write completes — so a request arriving mid-write still waits
  // for it via settled().
  documents.onDidChangeContent((e) => {
    const uri = e.document.uri
    const text = e.document.getText()
    writes = writes
      .then(async () => {
        await opts?.onDidChangeDocument?.(uri, text)
        if (store) await store.fs().write(uriToPath(uri), text)
      })
      .catch((err: unknown) => {
        // A failed write must not poison the chain for later edits.
        connection.console.error(`varar: write-through failed for ${uri}: ${String(err)}`)
      })
    scheduleReindex()
  })

  connection.onDidChangeWatchedFiles(async (params) => {
    if (!runResults) return
    for (const change of params.changes) {
      const path = uriToPath(change.uri)
      if (!path.includes('/.varar/') || !path.endsWith('.json')) continue
      // FileChangeType: 1 Created, 2 Changed, 3 Deleted. A result file speaks
      // for its oath AND for every document its steps were spliced in from
      // (ADR 0016), so each of those is republished — including a document
      // the previous record named and this one no longer does.
      const uris = change.type === 3 ? runResults.remove(path) : await ingestWatched(path)
      for (const uri of uris) await publishFor(uri)
    }
  })

  async function ingestWatched(path: string): Promise<ReadonlyArray<string>> {
    if (!store || !runResults) return []
    try {
      return runResults.ingest(path, await store.fs().read(path))
    } catch {
      return []
    }
  }

  function toParseDiagnostics(uri: string): LspDiagnostic[] {
    if (!handlers) return []
    return handlers.diagnosticsFor(uri).map((d) => ({
      severity: d.severity === 'error' ? 1 : 2,
      source: 'var',
      message: d.message,
      range: {
        start: { line: d.range.start.line - 1, character: d.range.start.character - 1 },
        end: { line: d.range.end.line - 1, character: d.range.end.character - 1 },
      },
      code: d.code,
    }))
  }

  async function publishFor(uri: string): Promise<void> {
    if (!store) return
    const parse = toParseDiagnostics(uri)
    // A URI can be the subject of several results: its own, plus one per oath
    // that referenced a section of it (ADR 0016).
    const relevant = runResults?.resultsFor(uri) ?? []
    let run: LspDiagnostic[] = []
    if (relevant.length > 0) {
      let source = documents.get(uri)?.getText()
      if (source === undefined) {
        try {
          source = await store.fs().read(uriToPath(uri))
        } catch {
          source = undefined
        }
      }
      if (source !== undefined) {
        const text = source
        run = relevant.flatMap((r) => runLspDiagnostics(r.results, text, r.forDocument))
      }
    }
    void connection.sendDiagnostics({ uri, diagnostics: [...parse, ...run] as Diagnostic[] })
  }

  function publishAll(): void {
    if (!store) return
    const uris = new Set<string>()
    for (const d of store.index().diagnostics) uris.add(`file://${d.oathPath}`)
    if (runResults) for (const u of runResults.oathUris()) uris.add(u)
    for (const u of uris) void publishFor(u)
  }

  function afterReindex(): void {
    if (!store || !handlers) return
    publishAll()
    // Wake the client so it can refresh editor decorations and any other
    // client-side projections of the workspace index.
    void connection.sendNotification('var/didIndex')
  }

  // Offer "Accept as prose" wherever a drift diagnostic covers the request
  // range. The action carries a server command; the client rounds back through
  // executeCommand below.
  connection.onCodeAction((params) => {
    const drifted = params.context.diagnostics.filter((d) => d.code === 'drift')
    if (drifted.length === 0) return []
    const action: CodeAction = {
      title: 'Accept as prose (var drift)',
      kind: CodeActionKind.QuickFix,
      diagnostics: drifted,
      command: {
        title: 'Accept as prose',
        command: 'varar.acceptDrift',
        arguments: [params.textDocument.uri],
      },
    }
    return [action]
  })

  connection.onExecuteCommand(async (params) => {
    if (params.command !== 'varar.acceptDrift' || !store) return
    const uri = params.arguments?.[0] as string | undefined
    if (!uri) return
    await store.acceptDrift(uriToPath(uri))
    await store.reindex()
    afterReindex()
  })

  connection.onHover(async (params) => {
    await settled()
    if (!handlers) return null
    const result = handlers.hover({
      uri: params.textDocument.uri,
      position: params.position,
    })
    return result === null ? null : { contents: result.contents }
  })

  connection.onDefinition(async (params) => {
    await settled()
    if (!handlers) return []
    const links = handlers.definition({
      uri: params.textDocument.uri,
      position: params.position,
    })
    return links as LocationLink[]
  })

  // Custom request for selection-driven step-definition generation. The
  // client is responsible for source (the user's selection) and target
  // (the steps file to append to); the server only knows how to translate
  // text → snippet.
  connection.onRequest(
    'var/generateSnippet',
    async (params: {
      text: string
      uri?: string
      position?: { line: number; character: number }
    }) => {
      await settled()
      if (!handlers) return null
      return handlers.generateSnippet({
        text: params.text,
        ...(params.uri !== undefined ? { uri: params.uri } : {}),
        ...(params.position !== undefined ? { position: params.position } : {}),
      })
    },
  )

  connection.onRequest('var/stepGlobs', () => {
    if (!handlers) return []
    return handlers.stepGlobs()
  })

  // Resolve everything the Rename refactor needs from a single position —
  // the step def's expression + every matched .md site with its current
  // captured values. Returns null when the position isn't on a step.
  connection.onRequest(
    'var/stepAt',
    async (params: { uri: string; position: { line: number; character: number } }) => {
      await settled()
      if (!handlers) return null
      return handlers.stepAt(params)
    },
  )

  // Drive the cross-file rename. The server resolves the step, derives the
  // new expression, diffs, and returns ready-to-apply edits — or an error.
  // Phase 3 path: refuses when any parameter is added/removed/type-changed.
  connection.onRequest<ReturnType<LspHandlers['renameStep']> | null, void>(
    'var/renameStep',
    async (params: {
      uri: string
      position: { line: number; character: number }
      newName: string
    }) => {
      await settled()
      if (!handlers) return null
      return handlers.renameStep(params)
    },
  )

  // Phase 4 path: returns the rename plan (param fates + matches) so the
  // client can drive per-occurrence prompts for added / type-changed
  // parameters before applying anything.
  connection.onRequest<ReturnType<LspHandlers['planRename']> | null, void>(
    'var/planRename',
    async (params: {
      uri: string
      position: { line: number; character: number }
      newName: string
    }) => {
      await settled()
      if (!handlers) return null
      return handlers.planRename(params)
    },
  )

  // Render a (new) expression with a list of values into a literal string
  // suitable for splicing into a .md document.
  connection.onRequest<ReturnType<LspHandlers['renderExpressionText']> | null, void>(
    'var/renderExpressionText',
    (params: { expression: string; values: ReadonlyArray<string> }) => {
      if (!handlers) return null
      return handlers.renderExpressionText(params)
    },
  )

  connection.onRequest(
    'textDocument/semanticTokens/full',
    async (params: { textDocument: { uri: string } }) => {
      await settled()
      if (!store) return { data: [] }
      const uri = params.textDocument.uri
      const source = documents.get(uri)?.getText() ?? ''
      return { data: semanticTokenData(store.index().matches, uriToPath(uri), source) }
    },
  )

  connection.onCompletion(async (params) => {
    await settled()
    if (!handlers) return []
    const doc = documents.get(params.textDocument.uri)
    const line = doc
      ? doc.getText({
          start: { line: params.position.line, character: 0 },
          end: { line: params.position.line, character: params.position.character },
        })
      : ''
    const items = handlers.completions({
      uri: params.textDocument.uri,
      position: params.position,
      linePrefix: line,
    })
    // Re-shape to the LSP CompletionItem types the SDK expects.
    return items.map((item) => ({
      label: item.label,
      kind: 15, // CompletionItemKind.Snippet
      insertTextFormat: InsertTextFormat.Snippet,
      filterText: item.filterText,
      textEdit: {
        range: item.range,
        newText: item.insertText,
      },
    }))
  })
}
