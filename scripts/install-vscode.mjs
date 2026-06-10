#!/usr/bin/env node
import { existsSync, lstatSync, mkdirSync, rmSync, symlinkSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(ROOT, 'packages', 'bdd-vscode')
const DST = join(homedir(), '.vscode', 'extensions', 'oselvar.oselvar-bdd-0.0.0')

if (existsSync(DST) || isBrokenSymlink(DST)) {
  rmSync(DST, { recursive: true, force: true })
}
mkdirSync(dirname(DST), { recursive: true })
symlinkSync(SRC, DST, 'dir')

// biome-ignore lint/suspicious/noConsoleLog: dev script
console.log(`linked: ${DST} → ${SRC}`)
// biome-ignore lint/suspicious/noConsoleLog: dev script
console.log('Reload VSCode (Cmd+Shift+P → "Reload Window") to pick up the extension.')

function isBrokenSymlink(p) {
  try {
    return lstatSync(p).isSymbolicLink() && !existsSync(p)
  } catch {
    return false
  }
}
