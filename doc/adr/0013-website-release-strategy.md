# ADR 0013 — The website deploys from main; unreleased content is draft-gated per page

- **Status:** Accepted
- **Date:** 2026-07-28
- **Deciders:** Aslak Hellesøy
- **Tags:** website, releasing, trunk-based-development

## Context

varar.dev deploys on every push to `main` (the `deploy-website` job in
`typescript.yml`). Under trunk-based development, docs for a feature land in
the same commits as the feature's code — so the site would describe behavior
no released package has yet. To prevent that, work accumulated on a `next`
branch, which reintroduced exactly the long-lived-branch problem trunk-based
development exists to avoid: `next` drifted 11 commits ahead of `main`,
holding a breaking change hostage to a website-publishing concern.

Meanwhile PR #67 proposed serving build-accurate archives of every past
release at `/v/<version>/`. That raised a second question: does a pre-1.0
project need old-version docs at all, and do archived versions pollute search
results and AI-crawler corpora with stale APIs?

Doc velocity is high — typo fixes, clarified tutorials, and reference
improvements happen far more often than releases. Any strategy that couples
every doc change to a release (deploying only on release tags) would make
routine doc fixes wait days, or force doc-driven patch releases.

## Decision

**The website keeps deploying from every push to `main`.** Trunk stays the
only long-lived branch; `next` is merged back and deleted. Doc improvements
go live in minutes.

**Unreleased content is held back per page, not per branch:**

1. **A new page documenting an unreleased feature** carries Starlight's
   built-in `draft: true` frontmatter. Draft pages are excluded from
   production builds (they still render in `pnpm dev`). The commit that
   prepares the release removes the flag.
2. **An edit to an existing page describing changed behavior** cannot be
   draft-gated — hiding the page would hide the current docs too. Such edits
   ride the same commits as the code change, and a release follows promptly.
   On 0.x, releases are cheap (`make prepare` + `make release`); a short
   window where the site is ahead of the registries is acceptable, a
   long-lived one is not. If a behavior-changing branch of work cannot be
   released promptly, it should not be merged yet.

**PR #67 (versioned archives at `/v/<version>/`) is parked, not merged.**
Pre-1.0 there is no user base pinned to old releases; the current release's
docs are the only ones that matter, and every published old version is
surface area for crawlers to index a stale API. The snapshot mechanism stays
in the PR for revival after 1.0, when real users on old majors exist. When
revived: archived versions keep `noindex`, gain a `robots.txt`
`Disallow: /v/`, and link canonically to the current docs.

## Consequences

- `next` is deleted; nobody has to remember which branch the website deploys
  from. All work lands on `main`.
- Authors of new-feature doc pages must remember `draft: true`. Forgetting it
  publishes the page early — low-stakes, and caught in review.
- Merging a behavior-changing edit to existing docs creates an obligation to
  release promptly. This is a feature: it keeps trunk releasable and releases
  small.
- No release-tag deploy machinery, no hotfix `workflow_dispatch`, no doc
  cherry-picking — the deploy pipeline is unchanged.
