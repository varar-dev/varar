import { DEFAULT_SNIPPET_TEMPLATE } from '@oselvar/var'
import { registerHandlers } from '@oselvar/var-lsp'
import { BrowserMessageReader, BrowserMessageWriter, createConnection } from 'vscode-languageserver/browser.js'
import { createIdbFileSystem } from './idb-file-system.ts'
import { SEED_FILES } from './seed-files.ts'

const reader = new BrowserMessageReader(self as DedicatedWorkerGlobalScope)
const writer = new BrowserMessageWriter(self as DedicatedWorkerGlobalScope)
const connection = createConnection(reader, writer)

const config = {
  vars: ['**/*.var.md'],
  steps: ['**/*.steps.ts'],
  snippet: { template: DEFAULT_SNIPPET_TEMPLATE },
  scannerPlugins: [],
}

registerHandlers(connection, async () => ({
  fs: await createIdbFileSystem(SEED_FILES),
  config,
}))
connection.listen()
