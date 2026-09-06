#!/usr/bin/env node
import { parseArgv } from './argv.ts'
import { runInit } from './init.ts'
import { runLint } from './lint.ts'

const parsed = parseArgv(process.argv.slice(2))

async function main(): Promise<void> {
  const io = {
    cwd: process.cwd(),
    writeStdout: (s: string) => process.stdout.write(s),
    writeStderr: (s: string) => process.stderr.write(s),
  }
  const globs = parsed.positionals.length > 0 ? parsed.positionals : undefined
  switch (parsed.command) {
    case '':
    case 'help':
    case '--help':
    case '-h':
      process.stdout.write(
        [
          'varar — markdown-native BDD',
          '',
          'Usage:',
          '  varar lint [globs]       check oaths against their step definitions',
          '  varar init               scaffold a new project (detects the test runner)',
          '  varar init --runner <r>  scaffold for a specific runner (vitest)',
          '',
        ].join('\n'),
      )
      break
    case 'lint': {
      const result = await runLint({ ...io, json: parsed.flags.json === true, globs })
      process.exitCode = result.exitCode
      break
    }
    case 'init': {
      const runner = typeof parsed.flags.runner === 'string' ? parsed.flags.runner : undefined
      const result = await runInit({
        cwd: io.cwd,
        writeStdout: io.writeStdout,
        writeStderr: io.writeStderr,
        runner,
      })
      process.exitCode = result.exitCode
      break
    }
    // Removed in favour of the runner the project already has. Worth its own
    // case: "unknown command" would tell someone who followed an old README
    // nothing about where the command went.
    case 'run':
      process.stderr.write(
        [
          'varar: `varar run` has been removed — oaths run through your own test runner.',
          '',
          '  run:           pnpm vitest run',
          '  accept drift:  VARAR_UPDATE=1 pnpm vitest run',
          '  set it up:     varar init',
          '',
          '  https://varar.dev/how-to/run-with-vitest/',
          '',
        ].join('\n'),
      )
      process.exitCode = 1
      break
    default:
      process.stderr.write(`varar: unknown command "${parsed.command}". Try \`varar help\`.\n`)
      process.exitCode = 1
  }
}

main().catch((err: unknown) => {
  process.stderr.write(`varar: ${err instanceof Error ? err.message : String(err)}\n`)
  process.exitCode = 1
})
