import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import type { GrammarLoader } from '@oselvar/var-language'

export function createNodeGrammarLoader(): GrammarLoader {
  return {
    async load(languageId) {
      const filename =
        languageId === 'typescript-tsx' ? 'tree-sitter-tsx.wasm' : 'tree-sitter-typescript.wasm'
      const url = import.meta.resolve(`tree-sitter-typescript/${filename}`)
      return readFile(fileURLToPath(url))
    },
  }
}
