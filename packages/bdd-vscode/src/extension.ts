import { resolve } from 'node:path'
import type { ExtensionContext } from 'vscode'
import {
  type LanguageClientOptions,
  type ServerOptions,
  TransportKind,
} from 'vscode-languageclient/node.js'
import { LanguageClient } from 'vscode-languageclient/node.js'

let client: LanguageClient | undefined

export function activate(context: ExtensionContext): void {
  // The symlink installer (T8) mirrors `packages/bdd-vscode/` into
  // ~/.vscode/extensions/. Adjacent to it lives `packages/bdd-lsp/dist/bin.js`,
  // which is built by `pnpm install:vscode`.
  const serverModule = resolve(context.extensionPath, '..', 'bdd-lsp', 'dist', 'bin.js')
  const serverOptions: ServerOptions = {
    run: { module: serverModule, transport: TransportKind.stdio },
    debug: { module: serverModule, transport: TransportKind.stdio },
  }
  const clientOptions: LanguageClientOptions = {
    documentSelector: [
      { scheme: 'file', pattern: '**/*.bdd.md' },
      { scheme: 'file', pattern: '**/*.steps.ts' },
    ],
  }
  client = new LanguageClient('oselvar-bdd', 'oselvar BDD', serverOptions, clientOptions)
  void client.start()
}

export async function deactivate(): Promise<void> {
  if (client) await client.stop()
}
