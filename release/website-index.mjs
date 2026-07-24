#!/usr/bin/env node
// Generate the version-archive hub for the website.
//
// Scans <v-dir> for `<major>.<minor>.<patch>/` snapshot subdirectories (each a
// build-accurate archive of a past release, produced by website-snapshot.sh) and
// writes two files into <v-dir>:
//   - versions.json  — the machine-readable list, newest first
//   - index.html     — a small, dependency-free landing page linking to each
//                      archived version, served at https://varar.dev/v/
//
// The hub is assembled at deploy time, outside Astro, because it has to list
// versions that were each built from a different release tag — no single Astro
// build knows about all of them.
import { readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const vDir = process.argv[2]
if (!vDir) {
  console.error('usage: website-index.mjs <v-dir>')
  process.exit(1)
}

const semver = /^(\d+)\.(\d+)\.(\d+)$/
const entries = await readdir(vDir, { withFileTypes: true })
const versions = entries
  .filter((e) => e.isDirectory() && semver.test(e.name))
  .map((e) => e.name)
  .sort((a, b) => {
    const pa = a.split('.').map(Number)
    const pb = b.split('.').map(Number)
    return pb[0] - pa[0] || pb[1] - pa[1] || pb[2] - pa[2]
  })

await writeFile(join(vDir, 'versions.json'), `${JSON.stringify(versions, null, 2)}\n`)

const rows = versions
  .map(
    (v) =>
      `      <li><a href="/v/${v}/"><span class="v">v${v}</span><span class="go">Open&nbsp;&rarr;</span></a></li>`,
  )
  .join('\n')

const html = `<!doctype html>
<html lang="en" data-theme="auto">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Version history — Varar</title>
    <meta
      name="description"
      content="Build-accurate archives of past releases of the Varar website."
    />
    <link rel="canonical" href="https://varar.dev/v/" />
    <style>
      :root {
        color-scheme: light dark;
        --bg: #fff;
        --fg: #1b1b1f;
        --muted: #5c5f66;
        --card: #f6f6f8;
        --border: #e3e3e8;
        --accent: #3352cc;
      }
      @media (prefers-color-scheme: dark) {
        :root {
          --bg: #17181c;
          --fg: #f2f2f4;
          --muted: #a0a3ab;
          --card: #202127;
          --border: #33353b;
          --accent: #93a7f2;
        }
      }
      * {
        box-sizing: border-box;
      }
      body {
        margin: 0;
        background: var(--bg);
        color: var(--fg);
        font: 16px/1.55 system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
      }
      main {
        max-width: 44rem;
        margin: 0 auto;
        padding: 4rem 1.25rem 6rem;
      }
      h1 {
        font-size: 2rem;
        margin: 0 0 0.5rem;
      }
      p.lede {
        color: var(--muted);
        margin: 0 0 2.5rem;
      }
      a.home {
        color: var(--accent);
        text-decoration: none;
        font-weight: 600;
      }
      ul {
        list-style: none;
        margin: 0;
        padding: 0;
        display: grid;
        gap: 0.6rem;
      }
      li a {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 1rem;
        padding: 0.9rem 1.1rem;
        border: 1px solid var(--border);
        border-radius: 0.6rem;
        background: var(--card);
        color: var(--fg);
        text-decoration: none;
        transition: border-color 0.15s ease;
      }
      li a:hover {
        border-color: var(--accent);
      }
      .v {
        font-weight: 600;
        font-variant-numeric: tabular-nums;
      }
      .go {
        color: var(--muted);
        font-size: 0.9rem;
      }
      .empty {
        color: var(--muted);
      }
      footer {
        margin-top: 3rem;
        color: var(--muted);
        font-size: 0.9rem;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>Version history</h1>
      <p class="lede">
        Build-accurate archives of past Varar releases — each is the website
        exactly as it shipped, interactive editor and all. The
        <a class="home" href="/">latest version</a> lives at the site root.
      </p>
${versions.length ? `      <ul>\n${rows}\n      </ul>` : '      <p class="empty">No archived versions yet.</p>'}
      <footer>
        Looking for the newest docs? Head to <a class="home" href="/">varar.dev</a>.
      </footer>
    </main>
  </body>
</html>
`

await writeFile(join(vDir, 'index.html'), html)
console.log(`wrote ${vDir}/index.html and versions.json (${versions.length} version(s))`)
