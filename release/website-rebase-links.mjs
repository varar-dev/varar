#!/usr/bin/env node
// Rebase root-absolute links in a built website snapshot under its version
// prefix.
//
// Astro/Vite rewrite every link and asset URL *they* emit to sit under the
// configured `base` (e.g. /v/0.7.0/), but they leave hand-written root-absolute
// links in the Markdown content alone — `[sensors](/reference/sensors)` stays
// `/reference/sensors`. In a version snapshot served under /v/0.7.0/ those links
// silently escape the archive and land on the live site. This rewrites them so
// an archived version is fully self-contained: every internal navigation stays
// within /v/<version>/.
//
// Usage: node release/website-rebase-links.mjs <dist-dir> <base>
//   <base> is the path prefix with leading and trailing slash, e.g. /v/0.7.0/
//
// Only <dist-dir>/**/*.html is touched. A link is rewritten iff it is
// root-absolute (starts with a single "/", not "//" and not a full URL) and not
// already under <base>. Fragment-only (#…) and query-only (?…) links, mailto:,
// full URLs and protocol-relative //host links are all left untouched.
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const [distDir, base] = process.argv.slice(2)
if (!distDir || !base || !base.startsWith('/') || !base.endsWith('/')) {
  console.error('usage: website-rebase-links.mjs <dist-dir> <base=/v/x.y.z/>')
  process.exit(1)
}

// Matches href="/…" / src="/…" (single or double quotes) where the path is
// root-absolute but not protocol-relative (//) and not in the /v/ archive
// namespace. Skipping all of /v/ (not just the current base) keeps the rewrite
// idempotent AND leaves cross-archive links alone: from inside /v/0.7.0/, a
// "Version history" link to /v/ must stay pointing at the live hub, never become
// /v/0.7.0/v/. External URLs (http…, //host) are left untouched too.
const linkRe = /(\b(?:href|src)=)(["'])\/(?!\/|v\/)/g

async function* htmlFiles(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) yield* htmlFiles(full)
    else if (entry.name.endsWith('.html')) yield full
  }
}

let rewritten = 0
for await (const file of htmlFiles(distDir)) {
  const src = await readFile(file, 'utf8')
  const next = src.replace(linkRe, (_m, attr, quote) => `${attr}${quote}${base}`)
  if (next !== src) {
    await writeFile(file, next)
    rewritten++
  }
}
console.log(`rebased root-absolute links under ${base} in ${rewritten} file(s)`)
