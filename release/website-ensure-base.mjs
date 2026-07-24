#!/usr/bin/env node
// Make a website Astro config honour VARAR_SITE_BASE, in place and idempotently.
//
// The current config already reads VARAR_SITE_BASE (see astro.config.mjs). This
// script exists for BACKFILL: building an *old* release tag whose config predates
// that support. Checked out at such a tag, the config ignores the env var and
// would emit root-absolute asset/link URLs that break under /v/<version>/. This
// injects the base wiring so the historical snapshot builds correctly, without
// editing the tag itself (the checkout is a throwaway worktree).
//
// Idempotent: if the config already mentions VARAR_SITE_BASE, it is left as-is,
// so running it against a modern tag is a no-op.
//
// Usage: node release/website-ensure-base.mjs <path-to-astro.config.mjs>
import { readFile, writeFile } from 'node:fs/promises'

const configPath = process.argv[2]
if (!configPath) {
  console.error('usage: website-ensure-base.mjs <astro.config.mjs>')
  process.exit(1)
}

const src = await readFile(configPath, 'utf8')

if (src.includes('VARAR_SITE_BASE')) {
  console.log('config already base-aware; nothing to do')
  process.exit(0)
}

// Insert `base: process.env.VARAR_SITE_BASE || undefined,` as the first property
// of the defineConfig({ … }) object. Every website config back to the first
// release opens its config with this exact call, so this anchor is stable.
const anchor = 'defineConfig({'
const at = src.indexOf(anchor)
if (at === -1) {
  console.error(`could not find "${anchor}" in ${configPath}`)
  process.exit(1)
}

const insertAt = at + anchor.length
const next = `${src.slice(0, insertAt)}\n  base: process.env.VARAR_SITE_BASE || undefined,${src.slice(
  insertAt,
)}`
await writeFile(configPath, next)
console.log(`injected VARAR_SITE_BASE support into ${configPath}`)
