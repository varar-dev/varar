import { readFileSync, statSync } from 'node:fs'
import { toOathPath } from '@varar/config'
import { buildWorkspace, type OathWorkspace, parse, references } from '@varar/core'

// Whether a section of an oath is a standalone example depends on whether any
// OTHER oath references it (ADR 0016), so the plugin — which transforms one
// oath at a time — has to know the whole project before it can transform any of
// them. This module builds that view once per set of file versions.

export type OathSources = ReadonlyMap<string, string>

// A cheap fingerprint of the oath set: path, size and mtime. Rebuilding the
// workspace means reading and parsing every oath, which would otherwise happen
// once per transformed oath — quadratic in a project's oath count.
function fingerprint(absPaths: ReadonlyArray<string>): string {
  return absPaths
    .map((p) => {
      try {
        const st = statSync(p)
        return `${p}:${st.size}:${st.mtimeMs}`
      } catch {
        return `${p}:missing`
      }
    })
    .join('\n')
}

let cached: { readonly key: string; readonly workspace: OathWorkspace } | undefined

export function projectWorkspace(cwd: string, absPaths: ReadonlyArray<string>): OathWorkspace {
  const key = fingerprint(absPaths)
  if (cached?.key === key) return cached.workspace
  const docs = absPaths.map((abs) => {
    const path = toOathPath(cwd, abs)
    let source = ''
    try {
      source = readFileSync(abs, 'utf8')
    } catch {
      // A file that vanished between glob and read contributes nothing.
    }
    return parse(path, source)
  })
  const workspace = buildWorkspace(docs)
  cached = { key, workspace }
  return workspace
}

// The sources the generated module must carry so the RUNTIME plan sees the same
// workspace the build-time plan did: every oath this one references, plus
// everything those reach, transitively.
export function referencedSources(workspace: OathWorkspace, oathPath: string): OathSources {
  const out = new Map<string, string>()
  const seen = new Set<string>([oathPath])
  const queue = [oathPath]
  while (queue.length > 0) {
    const next = queue.shift()
    if (next === undefined) break
    const doc = workspace.docs.get(next)
    if (!doc) continue
    for (const ref of references(doc)) {
      if (seen.has(ref.path)) continue
      seen.add(ref.path)
      const target = workspace.docs.get(ref.path)
      if (!target) continue
      out.set(ref.path, target.source)
      queue.push(ref.path)
    }
  }
  return out
}

// The consumed-section keys, as a plain array the generated module can inline.
export function referencedKeys(workspace: OathWorkspace): ReadonlyArray<string> {
  return [...workspace.referenced].sort()
}

// Whether any section of this oath is consumed by a reference elsewhere.
// Combined with a plan that yields no examples, it distinguishes "nothing to
// run because this file is reused" — which gets the skipped-suite placeholder
// — from "nothing to run because nothing matched", which is an ordinary empty
// oath and must keep failing as it does today.
export function hasConsumedSection(workspace: OathWorkspace, oathPath: string): boolean {
  const prefix = `${oathPath}#`
  for (const key of workspace.referenced) if (key.startsWith(prefix)) return true
  return false
}
