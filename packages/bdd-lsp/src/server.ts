import { type Connection, TextDocumentSyncKind } from 'vscode-languageserver'
export type { StepDef } from '@oselvar/bdd-language'
export { loadBddConfig } from '@oselvar/bdd'

export function registerHandlers(connection: Connection): void {
  connection.onInitialize(() => ({
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Full,
    },
  }))
}
