import { relative, sep } from 'node:path'

// An oath's identity: its path relative to the workspace root, POSIX
// separators. The same string keys varar.lock.json and .varar/<oathPath>.json,
// and it is what every port hands to parse()/plan() as `doc.path` — so a
// relative reference from one oath to another resolves against a path that
// means the same thing in every runtime (ADR 0016).
//
// A path outside the root keeps its `../` prefix (oaths may live in a sibling
// directory via a `../shared/**` glob); an unrelatable path falls back to the
// input with POSIX separators.
export function toOathPath(root: string, path: string): string {
  const rel = relative(root, path)
  return (rel === '' ? path : rel).split(sep).join('/')
}
