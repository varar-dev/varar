import type { VarDoc } from './ast.ts'
import { type ScannerPlugin, scan } from './scanner.ts'
import { structure } from './structurer.ts'

export function parse(
  path: string,
  source: string,
  plugins: ReadonlyArray<ScannerPlugin> = [],
): VarDoc {
  return structure(path, source, scan(source, plugins))
}
