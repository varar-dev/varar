#!/usr/bin/env node
import { parseArgv } from './argv.js'

const parsed = parseArgv(process.argv.slice(2))

switch (parsed.command) {
  case '':
  case 'help':
  case '--help':
  case '-h':
    process.stdout.write(
      [
        'bdd — markdown-native BDD',
        '',
        'Usage:',
        '  bdd stepdef "<text>"   generate a step definition',
        '  bdd lint [globs]       check for missing/ambiguous/orphan steps',
        '  bdd init               scaffold a new project',
        '',
      ].join('\n'),
    )
    break
  default:
    process.stderr.write(`bdd: unknown command "${parsed.command}". Try \`bdd help\`.\n`)
    process.exitCode = 1
}
