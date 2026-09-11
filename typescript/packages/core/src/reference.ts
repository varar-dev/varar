import type { Doc, Example } from './ast.ts'

// Reuse is a link (ADR 0016). A candidate block whose entire content is a
// single Markdown link to an oath section is a REFERENCE BLOCK: it splices
// that section's steps in at its own position instead of being prose.
//
// Everything here is pure text and path arithmetic — no filesystem. The shell
// reads the documents; `references()` tells it which ones to read, and
// `buildWorkspace()` turns the collection into what `plan()` needs.

export type Reference = {
  // The referenced oath's path, resolved against the referring doc's own path.
  // Equal to the referring doc's path for a same-file `#fragment` link.
  readonly path: string
  // The GFM slug of the heading being referenced, or '' for a whole-file link.
  readonly slug: string
  // The link's visible text, as written.
  readonly text: string
}

// A candidate is a reference block iff its whole text is one Markdown link
// whose target is oath-shaped. Anything else — a link with surrounding words, a
// link to https://…, to a .ts file, to a mailto: — is ordinary content, so
// existing documents keep their meaning.
const LINK_ONLY = /^\[([^\]]*)\]\(\s*([^\s)]+)\s*\)$/

export function referenceOf(text: string, fromPath: string): Reference | undefined {
  const m = LINK_ONLY.exec(text.trim())
  if (!m) return undefined
  const [, linkText = '', target = ''] = m
  if (target.startsWith('#')) {
    return { path: fromPath, slug: normalizeSlug(target.slice(1)), text: linkText }
  }
  const hash = target.indexOf('#')
  const filePart = hash === -1 ? target : target.slice(0, hash)
  const fragment = hash === -1 ? '' : target.slice(hash + 1)
  // Only a relative Markdown path is a reference. A protocol (https:, mailto:)
  // or any other extension is left alone — remote references are deliberately
  // out of scope (ADR 0016).
  if (!filePart.endsWith('.md') || /^[a-z][a-z0-9+.-]*:/i.test(filePart)) return undefined
  if (filePart.startsWith('/')) return undefined
  return {
    path: joinPosix(dirnamePosix(fromPath), filePart),
    slug: normalizeSlug(fragment),
    text: linkText,
  }
}

// GitHub's heading anchors: inline markup dropped, lowercased, spaces to
// hyphens, everything else that isn't a word character or hyphen removed. The
// same function produces the slug of a heading and normalizes the slug written
// in a link, so the two meet in the middle.
export function slugify(headingText: string): string {
  return normalizeSlug(
    headingText
      .replace(/`([^`]*)`/g, '$1')
      .replace(/\*\*([^*]*)\*\*/g, '$1')
      .replace(/\*([^*]*)\*/g, '$1')
      .replace(/_([^_]*)_/g, '$1'),
  )
}

function normalizeSlug(s: string): string {
  return (
    s
      .trim()
      .toLowerCase()
      .replace(/[^\p{L}\p{N} _-]/gu, '')
      // One hyphen per space, not per run of them: GitHub leaves the gap where
      // it dropped punctuation, so "Fees, VAT & rounding" slugs with a double
      // hyphen. Matching that exactly is the point — the link has to work on
      // GitHub, not just here.
      .replace(/ /g, '-')
  )
}

// POSIX path arithmetic on oath paths (always '/'-separated, relative to the
// workspace root). node:path is a shell dependency the core may not have.
function dirnamePosix(path: string): string {
  const i = path.lastIndexOf('/')
  return i === -1 ? '' : path.slice(0, i)
}

export function joinPosix(dir: string, rel: string): string {
  const segments = dir === '' ? [] : dir.split('/')
  for (const segment of rel.split('/')) {
    if (segment === '' || segment === '.') continue
    if (segment === '..') segments.pop()
    else segments.push(segment)
  }
  return segments.join('/')
}

// Every reference block in a document, in document order. The shell uses this
// to walk the closure of documents it must read before planning.
export function references(doc: Doc): ReadonlyArray<Reference> {
  const out: Reference[] = []
  for (const ex of doc.examples) {
    const primary = ex.body[0]
    if (!primary || !('text' in primary)) continue
    const ref = referenceOf(primary.text, doc.path)
    if (ref) out.push(ref)
  }
  return out
}

// What `plan()` needs to resolve references: every oath by path, plus which
// sections are consumed by a reference somewhere in the project. A section that
// is referenced stops being a standalone example, so this is whole-project
// knowledge — see ADR 0016 on why each runner builds it at its once-per-run
// discovery pass.
export type OathWorkspace = {
  readonly docs: ReadonlyMap<string, Doc>
  // `${path}#${slug}` for every referenced section; a whole-file reference is
  // recorded as `${path}#`.
  readonly referenced: ReadonlySet<string>
}

export function sectionKey(path: string, slug: string): string {
  return `${path}#${slug}`
}

// The workspace with no references at all: what a caller planning a single
// document in isolation passes, and the value every existing caller's behaviour
// is unchanged by.
export function emptyWorkspace(): OathWorkspace {
  return { docs: new Map(), referenced: new Set() }
}

export function buildWorkspace(docs: ReadonlyArray<Doc>): OathWorkspace {
  const byPath = new Map<string, Doc>()
  for (const doc of docs) byPath.set(doc.path, doc)
  const referenced = new Set<string>()
  for (const doc of docs) {
    for (const ref of references(doc)) referenced.add(sectionKey(ref.path, ref.slug))
  }
  return { docs: byPath, referenced }
}

// The candidates that make up a section: those whose heading chain contains the
// slug. A whole-file reference ('' slug) is every candidate in the document.
// Section membership follows the document outline exactly — a heading's section
// runs until the next heading of the same or higher level, which is precisely
// the range over which that heading stays on the scope stack.
export function sectionCandidates(doc: Doc, slug: string): ReadonlyArray<Example> {
  if (slug === '') return doc.examples
  return doc.examples.filter((ex) => ex.scopeStack.some((h) => slugify(h) === slug))
}
