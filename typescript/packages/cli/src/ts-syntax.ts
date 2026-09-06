import { spawnSync } from 'node:child_process'

// Does `source` parse as TypeScript?
//
// `init` edits exactly one file it did not write — an existing runner config —
// and a config it corrupts is a worse first five minutes than a manual paste.
// So the edit is verified before it is saved, by the same Node that will load
// the config: node:module's type stripper is a real parser and throws a
// SyntaxError on anything it cannot parse.
//
// Run in a child process on purpose. In-process the stripper prints an
// ExperimentalWarning that no library should make a CLI emit, and there is no
// way to suppress it without removing warning listeners the host installed.
// `--no-warnings` in a subprocess is contained and costs one spawn, once.
//
// Returns false on ANY failure, including a Node too old to have the stripper:
// "cannot verify" and "does not parse" lead to the same safe place, which is
// leaving the user's file alone and printing the snippet instead.
export function parsesAsTypeScript(source: string): boolean {
  const child = spawnSync(
    process.execPath,
    [
      '--no-warnings',
      '-e',
      'const { stripTypeScriptTypes } = require("node:module");' +
        'let s = "";' +
        'process.stdin.on("data", (c) => { s += c }).on("end", () => {' +
        '  try { stripTypeScriptTypes(s, { mode: "strip" }) } catch { process.exit(1) }' +
        '});',
    ],
    { input: source, encoding: 'utf8' },
  )
  return child.status === 0
}
