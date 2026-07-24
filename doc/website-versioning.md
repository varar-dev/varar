# Website version history

Readers can browse the website as it shipped for any past release at
`https://varar.dev/v/<version>/` — for example
[`https://varar.dev/v/0.7.0/`](https://varar.dev/v/0.7.0/). Each archived version
is **build-accurate**: not just the docs prose but the whole site, including the
interactive `<Editor>` components running exactly the `@varar/varar` code that
shipped in that release. A "Version history" link in the site footer, and the
hub page at [`/v/`](https://varar.dev/v/), list every archived version.

## Why build-accurate, not content-only

There is a Starlight plugin (`starlight-versions`) that snapshots docs *content*
into path-prefixed folders. We deliberately don't use it: it freezes Markdown
only, so an archived page's live editor would still run today's core. For a tool
whose whole pitch is "the prose IS the executable spec," that would be a lie —
the v0.5 page would show v0.5 words but v0.9 behaviour. Instead we build each
release tag from its own source and serve the whole thing under a path prefix.

## How it fits together

Everything is one Cloudflare Worker (`packages/website/wrangler.jsonc`) serving
static assets, so a versioned build has to live *inside* the deployed `dist/`.
The pieces:

- **`packages/website/astro.config.mjs`** reads `VARAR_SITE_BASE`. When set (e.g.
  `/v/0.7.0/`), Astro/Vite rewrite every internal link, emitted asset, and
  web-worker/wasm URL to sit under that prefix. Unset ⇒ the normal root build.

- **`release/website-rebase-links.mjs`** fixes the one thing Astro won't:
  hand-written root-absolute links in the Markdown (`[sensors](/reference/sensors)`).
  It rewrites them under the version prefix in the built HTML, so an archived
  version never silently links back out to the live site. Links in the `/v/`
  archive namespace are left alone (so a "Version history" link from inside
  `/v/0.7.0/` still points at the live hub, not `/v/0.7.0/v/`).

- **`release/website-snapshot.sh <version> <out-dir> [<src-root>]`** ties those
  together: build `<src-root>` (a checkout of the release tag) under base
  `/v/<version>/`, rebase links, and copy the result to `<out-dir>`.

- **`release/website-ensure-base.mjs`** is a backfill safety net: it injects
  `VARAR_SITE_BASE` support into an *older* tag's config that predates it. A
  no-op on any tag from this change onward.

- **`release/website-index.mjs`** generates the `/v/` hub (`index.html` +
  `versions.json`) by scanning the archived version folders.

- **`.github/workflows/website.yml`** orchestrates it. Archives are stored on an
  orphan **`website-snapshots`** branch — built assets for every release, kept
  off `main`'s history. The `snapshot` job (on a `v*` tag push, or manual
  backfill) builds the version from a worktree of its tag and commits it to that
  branch. The `deploy` job builds the live site, overlays the archive branch's
  `/v/` into `dist/`, and deploys — so a freshly-tagged release ships in the same
  run.

## Backfilling old releases

New releases are archived automatically when their tag is pushed. To archive the
releases that predate this system, run the **Website** workflow manually
(`workflow_dispatch`):

- Leave **version** blank to archive every release tag that has no snapshot yet.
- Or set it to a single bare semver (e.g. `0.6.1`) to (re)build just that one.

The job builds each missing version from a worktree of its tag — using its own
lockfile and toolchain, so the archive is faithful to what shipped — and pushes
the results to `website-snapshots`; the deploy then serves them. Very old tags
whose config or build differs substantially may need a hand; `website-ensure-base.mjs`
covers the common case (a config that simply predates `VARAR_SITE_BASE`).

## Alternatives considered

- **Subdomain per release** (`v0-7-0.varar.dev`): cleaner isolation but needs
  wildcard DNS + a route per version. Path-per-release keeps one domain and one
  Worker.
- **Rebuilding every tag on each deploy**: too slow and flaky. Archives are built
  once and stored, then re-served on every deploy.
