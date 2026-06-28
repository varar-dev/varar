import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, sep } from 'node:path'
import { type ExampleResult, hashSource, type SpecResults } from '@oselvar/var'

// Minimal structural view of the vitest task tree we walk (File/Suite/Test).
type TaskNode = {
  readonly name?: string
  readonly meta?: { readonly varResult?: ExampleResult }
  readonly tasks?: ReadonlyArray<TaskNode>
}
type FileNode = { readonly filepath: string; readonly tasks?: ReadonlyArray<TaskNode> }

function collectExamples(tasks: ReadonlyArray<TaskNode> | undefined): ExampleResult[] {
  const out: ExampleResult[] = []
  for (const t of tasks ?? []) {
    if (t.meta?.varResult) out.push(t.meta.varResult)
    if (t.tasks) out.push(...collectExamples(t.tasks))
  }
  return out
}

// Group every test's meta.varResult by its owning spec file, in declaration
// order. Files that produced no var results (e.g. only var:diagnostic tasks)
// are skipped.
export function collectFromTasks(files: ReadonlyArray<FileNode>): Map<string, ExampleResult[]> {
  const byFile = new Map<string, ExampleResult[]>()
  for (const f of files) {
    const examples = collectExamples(f.tasks)
    if (examples.length > 0) byFile.set(f.filepath, examples)
  }
  return byFile
}

// Absolute filepath → POSIX spec path relative to cwd.
export function toSpecPath(filepath: string, cwd: string): string {
  const rel = isAbsolute(filepath) ? relative(cwd, filepath) : filepath
  return rel.split(sep).join('/')
}

// Spec path → its result file under .var/.
export function resultFilePath(specPath: string, cwd: string): string {
  return join(cwd, '.var', `${specPath}.json`)
}

export function buildSpecResults(
  specPath: string,
  source: string,
  examples: ReadonlyArray<ExampleResult>,
): SpecResults {
  return { version: 1, specPath, sourceHash: hashSource(source), examples }
}

export type VarResultsReporterOptions = { readonly cwd?: string }

// Vitest reporter (the only side-effecting piece). Reads each spec's source,
// hashes it, and writes .var/<spec>.json. Registry-free: every ExampleResult
// arrives prebuilt on task.meta from the worker.
export class VarResultsReporter {
  private readonly cwd: string
  constructor(options: VarResultsReporterOptions = {}) {
    this.cwd = options.cwd ?? process.cwd()
  }

  // Legacy task-tree hook, still supported in vitest 4. `files` carries each
  // spec's filepath + task tree with the serialized meta.
  onFinished(files: ReadonlyArray<FileNode> = []): void {
    for (const [filepath, examples] of collectFromTasks(files)) {
      const specPath = toSpecPath(filepath, this.cwd)
      const source = readFileSync(filepath, 'utf8')
      const results = buildSpecResults(specPath, source, examples)
      const out = resultFilePath(specPath, this.cwd)
      mkdirSync(dirname(out), { recursive: true })
      writeFileSync(out, `${JSON.stringify(results, null, 2)}\n`)
    }
  }
}
