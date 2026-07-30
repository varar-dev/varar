#!/usr/bin/env node
// Architecture gate: a package must never re-export another package's API.
// Consumers import each package's types and functions from the package that
// defines them — re-exports create parallel import paths, hide real
// dependencies (a package can reach functionality it never declares), and
// grow the public API surface beyond the minimum.
//
// Two forms are rejected in packages/*/src:
//   1. export ... from '<bare specifier>'        (including `export * from`)
//   2. import { x } from '<bare specifier>' ... export { x }
//
// Relative re-exports (export { x } from './x.js') are the normal way a
// package assembles its own entry point and are allowed. A package's own
// subpaths (e.g. '@varar/vitest/runtime' from inside var-vitest) count
// as self, not cross-package.
//
// TypeScript 7 removed the in-process JS compiler (`ts.createSourceFile`); the
// supported replacement is the `unstable` API, which parses in the native tsgo
// process and hands back a decoded AST. That means a real Program per tsconfig
// rather than a free-standing parse — hence the snapshot below. The `is.*`
// predicates and the node shapes are otherwise the same as before.
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { computeLineStarts, getTokenPosOfNode } from 'typescript/unstable/ast'
import * as is from 'typescript/unstable/ast/is'
import { API } from 'typescript/unstable/sync'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PACKAGES_DIR = join(ROOT, 'packages')

function tsFilesUnder(dir) {
  return readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((e) => e.isFile() && e.name.endsWith('.ts') && !e.name.endsWith('.d.ts'))
    .map((e) => join(e.parentPath, e.name))
}

// Line of a node, from the source text — the old API's
// sourceFile.getLineAndCharacterOfPosition, which the decoded AST doesn't carry.
function lineOf(sourceFile, node) {
  const pos = getTokenPosOfNode(node, sourceFile)
  const starts = computeLineStarts(sourceFile.text)
  let lo = 0
  let hi = starts.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (starts[mid] <= pos) lo = mid
    else hi = mid - 1
  }
  return lo + 1
}

function isBare(specifier) {
  return !specifier.startsWith('./') && !specifier.startsWith('../')
}

function isSelf(specifier, ownName) {
  return specifier === ownName || specifier.startsWith(`${ownName}/`)
}

function checkFile(sourceFile, path, ownName) {
  const violations = []
  const violate = (node, message) => {
    violations.push(`${relative(ROOT, path)}:${lineOf(sourceFile, node)} ${message}`)
  }
  const foreign = (specifier) => isBare(specifier) && !isSelf(specifier, ownName)

  // Local binding name -> the bare specifier it was imported from.
  const importedFrom = new Map()
  for (const stmt of sourceFile.statements) {
    if (!is.isImportDeclaration(stmt) || !is.isStringLiteral(stmt.moduleSpecifier)) continue
    const specifier = stmt.moduleSpecifier.text
    if (!foreign(specifier)) continue
    const clause = stmt.importClause
    if (!clause) continue
    if (clause.name) importedFrom.set(clause.name.text, specifier)
    if (clause.namedBindings) {
      if (is.isNamespaceImport(clause.namedBindings)) {
        importedFrom.set(clause.namedBindings.name.text, specifier)
      } else {
        for (const el of clause.namedBindings.elements) importedFrom.set(el.name.text, specifier)
      }
    }
  }

  for (const stmt of sourceFile.statements) {
    if (is.isExportDeclaration(stmt)) {
      if (stmt.moduleSpecifier && is.isStringLiteral(stmt.moduleSpecifier)) {
        const specifier = stmt.moduleSpecifier.text
        if (foreign(specifier)) {
          violate(stmt, `re-exports from '${specifier}'`)
        }
      } else if (stmt.exportClause && is.isNamedExports(stmt.exportClause)) {
        for (const el of stmt.exportClause.elements) {
          const local = (el.propertyName ?? el.name).text
          const specifier = importedFrom.get(local)
          if (specifier) {
            violate(el, `re-exports '${local}' imported from '${specifier}'`)
          }
        }
      }
    } else if (is.isExportAssignment(stmt) && is.isIdentifier(stmt.expression)) {
      const specifier = importedFrom.get(stmt.expression.text)
      if (specifier) {
        violate(stmt, `default-exports '${stmt.expression.text}' imported from '${specifier}'`)
      }
    }
  }
  return violations
}

// Every package's src, paired with the package name it must not re-export past.
const targets = []
for (const entry of readdirSync(PACKAGES_DIR, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue
  const pkgDir = join(PACKAGES_DIR, entry.name)
  let ownName
  try {
    ownName = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8')).name
  } catch {
    continue
  }
  let files
  try {
    files = tsFilesUnder(join(pkgDir, 'src'))
  } catch {
    continue
  }
  for (const file of files) targets.push({ file, ownName })
}

const violations = []
const api = new API({ cwd: ROOT })
try {
  // One snapshot over every file: tsgo builds a Program per tsconfig it finds,
  // and each file is then read out of whichever project claims it.
  const snapshot = api.updateSnapshot({ openFiles: targets.map((t) => t.file) })
  for (const { file, ownName } of targets) {
    const sourceFile = snapshot.getDefaultProjectForFile(file)?.program.getSourceFile(file)
    if (!sourceFile) {
      process.stderr.write(`${relative(ROOT, file)} belongs to no tsconfig project\n`)
      process.exit(1)
    }
    violations.push(...checkFile(sourceFile, file, ownName))
  }
} finally {
  api.close()
}

if (violations.length > 0) {
  process.stderr.write(
    `${violations.join('\n')}\n\n` +
      `${violations.length} cross-package re-export(s). Packages must not re-export another ` +
      `package's API — consumers import it from the defining package instead.\n`,
  )
  process.exit(1)
}
process.stdout.write('no cross-package re-exports\n')
