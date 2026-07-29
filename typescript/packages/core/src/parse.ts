import type { Doc } from './ast.ts'
import { scan } from './scanner.ts'
import { structure } from './structurer.ts'

export function parse(path: string, source: string): Doc {
  return structure(path, source, scan(source))
}
