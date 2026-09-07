#!/usr/bin/env node
// Release gate: keep the VS Code extension installable on the editors people
// actually run it in.
//
// Three numbers have to agree, and nothing else in `make check` looks at them —
// no test loads `vscode`, and the .vsix is only ever built by release/lib.sh.
// That is how v0.8.0 went green through the whole gate and then failed at
// `ovsx publish`, with `vsce package` refusing a Renovate bump of
// `@types/vscode` to ~1.136.0 against an `engines.vscode` of ^1.105.0.
//
//   1. @types/vscode == engines.vscode. This is vsce's own rule, and the
//      reason for it is that the types are the API contract: types newer than
//      the engine let the extension compile against APIs that are simply
//      absent on the oldest host it claims to install on, and it crashes there
//      at runtime instead of failing to build.
//
//   2. engines.vscode >= what vscode-languageclient demands. Derived from the
//      installed dependency rather than written down here, so it tracks a
//      languageclient upgrade on its own.
//
//   3. engines.vscode <= FORK_CEILING. VS Code forks lag upstream badly, and
//      they refuse to install an extension whose engine floor is above their
//      base — the floor is what decides whether Cursor users can install the
//      extension at all. See FORK_CEILING below.
import { readFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

// The oldest VS Code base among the forks we intend to support. Cursor has sat
// on VS Code 1.105.1 (a September 2025 release) since early 2026 — it was on
// 1.99.3 before that, and has announced no upgrade despite sustained requests:
// https://forum.cursor.com/t/request-upgrade-vs-code-extension-api-base-beyond-1-105-1/164443
//
// Raising this is a claim that every fork has caught up. Check before you do;
// forks move on their own schedule, and a floor above their base is invisible
// in CI and total for their users.
const FORK_CEILING = [1, 105]

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'))

const pkgPath = join(root, 'packages/vscode/package.json')
const pkg = readJson(pkgPath)

// `^1.91.0`, `~1.91.0`, `1.91.0` all mean the same floor here: these are pins,
// not real ranges, so take the first version-looking thing and drop the patch.
const minor = (range, what) => {
  const m = /(\d+)\.(\d+)\.(\d+)/.exec(range)
  if (!m) throw new Error(`cannot read a version out of ${what}: ${range}`)
  return [Number(m[1]), Number(m[2])]
}
const fmt = ([maj, min]) => `${maj}.${min}`
const cmp = (a, b) => a[0] - b[0] || a[1] - b[1]

const engine = minor(pkg.engines.vscode, 'engines.vscode')
const types = minor(pkg.devDependencies['@types/vscode'], '@types/vscode')
const lcPath = join(root, 'packages/vscode/node_modules/vscode-languageclient/package.json')
const lcEngine = minor(readJson(lcPath).engines.vscode, "vscode-languageclient's engines.vscode")

const errors = []

if (cmp(engine, types) !== 0) {
  errors.push(
    `@types/vscode is ${fmt(types)} but engines.vscode is ${fmt(engine)}.\n` +
      `  vsce package refuses this. Move BOTH fields in packages/vscode/package.json\n` +
      `  in one commit — the pair is a single decision about which API floor the\n` +
      `  extension targets, not two independent dependency pins.`,
  )
}

if (cmp(engine, lcEngine) < 0) {
  errors.push(
    `engines.vscode is ${fmt(engine)} but vscode-languageclient needs ${fmt(lcEngine)}.\n` +
      `  The extension would install on hosts where its language client cannot run.\n` +
      `  Raise engines.vscode (and @types/vscode with it) to at least ${fmt(lcEngine)}.`,
  )
}

if (cmp(engine, FORK_CEILING) > 0) {
  errors.push(
    `engines.vscode is ${fmt(engine)}, above the ${fmt(FORK_CEILING)} fork ceiling.\n` +
      `  Cursor and other VS Code forks lag upstream and will refuse to install the\n` +
      `  extension at all. If every fork has genuinely caught up, raise FORK_CEILING\n` +
      `  in this script in the same commit — with a source for the claim.`,
  )
}

if (errors.length > 0) {
  process.stderr.write(`\n${relative(root, pkgPath)}:\n\n`)
  for (const e of errors) process.stderr.write(`  ✖ ${e}\n\n`)
  process.exit(1)
}
