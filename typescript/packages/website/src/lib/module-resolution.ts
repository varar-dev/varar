// Relative-import resolution over the set of files mounted in one <Editor>.
// Pure: paths and sources in, paths out — no filesystem, no editor state.
//
// Two callers share it so they can't disagree: the browser runner's CommonJS
// loader (run-worker.ts), which resolves at run time, and <Editor>'s
// build-time check, which fails `astro build` when a mounted .ts file imports
// a path no other tab provides (see Editor.astro).

// Normalize `./` and `../` segments of `specifier` against `fromPath`'s
// directory, yielding a path in the same style as the mounted paths.
export function normalizeRelative(specifier: string, fromPath: string): string {
  const dir = fromPath.includes('/') ? fromPath.slice(0, fromPath.lastIndexOf('/') + 1) : ''
  const segments: string[] = []
  for (const seg of `${dir}${specifier}`.split('/')) {
    if (seg === '' || seg === '.') continue
    if (seg === '..') segments.pop()
    else segments.push(seg)
  }
  return segments.join('/')
}

// The path a relative `specifier` resolves to among `paths`, or undefined when
// no tab provides it. Extensionless and `.js` specifiers fall back to `.ts`.
export function resolveRelative(
  specifier: string,
  fromPath: string,
  paths: Iterable<string>,
): string | undefined {
  const known = new Set(paths)
  const path = normalizeRelative(specifier, fromPath)
  for (const candidate of [path, `${path}.ts`, path.replace(/\.js$/, '.ts')]) {
    if (known.has(candidate)) return candidate
  }
  return undefined
}

// Every relative specifier in a TypeScript source: `import … from './x'`,
// bare `import './x'`, `export … from '../x'` and `import('./x')`. A regex is
// enough — these are hand-written example files, and a missed exotic form only
// costs a build-time check, never a wrong resolution.
export function relativeImports(source: string): ReadonlyArray<string> {
  const found: string[] = []
  const pattern = /(?:\bfrom|\bimport|\brequire)\s*\(?\s*['"](\.[^'"]*)['"]/g
  for (const m of source.matchAll(pattern)) if (m[1]) found.push(m[1])
  return found
}

export type SourceFile = { readonly path: string; readonly source: string }
export type UnresolvedImport = { readonly from: string; readonly specifier: string }

// The relative imports across `files` that no file in `files` provides.
export function unresolvedRelativeImports(
  files: ReadonlyArray<SourceFile>,
): ReadonlyArray<UnresolvedImport> {
  const paths = files.map((f) => f.path)
  return files.flatMap((file) =>
    relativeImports(file.source)
      .filter((specifier) => resolveRelative(specifier, file.path, paths) === undefined)
      .map((specifier) => ({ from: file.path, specifier })),
  )
}
