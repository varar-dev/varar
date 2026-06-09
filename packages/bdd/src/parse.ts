import type { Bdd } from './ast.js'
import { scan } from './scanner.js'
import { structure } from './structurer.js'

export function parse(path: string, source: string): Bdd {
  return structure(path, source, scan(source))
}
