#!/usr/bin/env node
import { parseArgv } from './argv.ts'
import { runInit } from './init.ts'
import { runLint } from './lint.ts'
import { runRun } from './run.ts'

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
          '  varar run [globs]        run markdown oath examples (no test runner)',
          '  varar run --update       accept drift and re-record varar.lock.json',
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
    case 'run': {
      const result = await runRun({ ...io, globs, update: parsed.flags.update === true })
      process.exitCode = result.exitCode
      break
    }
    default:
      process.stderr.write(`varar: unknown command "${parsed.command}". Try \`varar help\`.\n`)
      process.exitCode = 1
  }
}

main().catch((err: unknown) => {
  process.stderr.write(`varar: ${err instanceof Error ? err.message : String(err)}\n`)
  process.exitCode = 1
})
