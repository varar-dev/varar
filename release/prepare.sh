#!/usr/bin/env bash
# Prepare a release: bump every port to the next version and write the
# changelog as ONE reviewable commit on main. No tag, no publish — the actual
# publishing (and the tag + GitHub release) is release/release.sh, run after.
#
#   release/prepare.sh            version inferred from conventional commits
#   release/prepare.sh <version>  explicit override (e.g. the deliberate 1.0.0)
#   SKIP_GATE=1                    skip `make check` before committing
#
# Inference (cliff.toml [bump]): while on 0.x a breaking change bumps MINOR and
# anything else bumps PATCH, so 1.0.0 can never be prepared by accident — it
# only happens when someone types it.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
cd "$REPO_ROOT"

VERSION="${1:-}"
SKIP_GATE="${SKIP_GATE:-0}"

# ── Preflight ────────────────────────────────────────────────────────────────
for tool in git git-cliff node pnpm uv mvn bundle gem jq make; do
  require_tool "$tool"
done

[[ "$(git branch --show-current)" == "main" ]] || die "releases run from main"
[[ -z "$(git status --porcelain)" ]] || die "working tree not clean"
git fetch origin main --tags
git merge-base --is-ancestor origin/main HEAD ||
  die "local main is behind (or diverged from) origin/main — pull first"

# ── Version ──────────────────────────────────────────────────────────────────
if [[ -z "$VERSION" ]]; then
  latest="$(git describe --tags --abbrev=0 --match 'v[0-9]*' 2>/dev/null || true)"
  VERSION="$(git-cliff --bumped-version 2>/dev/null)" && VERSION="${VERSION#v}" ||
    die "git-cliff --bumped-version failed"
  [[ -z "$latest" || "v$VERSION" != "$latest" ]] ||
    die "nothing to release: no feat/fix/perf/breaking commits since $latest"
  log "inferred version $VERSION from conventional commits${latest:+ since $latest}"
fi
is_semver "$VERSION" || die "not a semver version: $VERSION"
TAG="v$VERSION"

git rev-parse -q --verify "refs/tags/$TAG" >/dev/null &&
  die "tag $TAG already exists — is $VERSION already prepared or released?"

[[ -n "$(generate_changelog "$TAG" | changelog_section "$VERSION")" ]] ||
  die "commits since $CHANGELOG_SINCE produce no changelog content for $VERSION — are they conventional? (see CLAUDE.md)"

# ── Stamp + changelog ────────────────────────────────────────────────────────
release/stamp.sh "$VERSION"
release/changelog.sh "$TAG"
git diff --quiet && die "nothing changed after stamping $VERSION — already prepared?"

# ── Gate ─────────────────────────────────────────────────────────────────────
if [[ "$SKIP_GATE" == "1" ]]; then
  warn "skipping make check (SKIP_GATE=1)"
else
  make check
fi

# ── Commit + push ────────────────────────────────────────────────────────────
git add CHANGELOG.md \
  typescript/packages/*/package.json \
  python/packages/*/pyproject.toml python/uv.lock \
  java/pom.xml java/*/pom.xml \
  examples/*/build.gradle.kts examples/java-junit-maven/pom.xml \
  ruby/packages ruby/Gemfile.lock
git commit -m "Release $TAG"
git push origin main
log "prepared $TAG and pushed to origin/main — now run: make release"
