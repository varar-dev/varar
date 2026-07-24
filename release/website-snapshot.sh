#!/usr/bin/env bash
# Build a build-accurate website snapshot for one release version.
#
# Runs against whatever the working tree is currently checked out at (a release
# tag) and writes the finished, self-contained archive — links rebased under
# /v/<version>/ — to <out-dir>. The whole archive, interactive editor and all,
# is exactly what shipped for that release; only URLs are re-homed under the
# version prefix.
#
# Usage: release/website-snapshot.sh <version> <out-dir> [<src-root>]
#   <version>   bare semver, e.g. 0.7.0 (no leading "v")
#   <out-dir>   emptied and filled with the snapshot (e.g. .../v/0.7.0)
#   <src-root>  repo checkout to BUILD from; defaults to this script's repo.
#               Backfill passes a worktree of the release tag here, so an old
#               version is built from its own source while the snapshot *tooling*
#               (this script and its helpers) always comes from the current repo.
#
# The caller is responsible for checking out the right ref into <src-root> and
# running `pnpm install` there beforehand (a historical tag brings its own
# lockfile).
set -euo pipefail

VERSION="${1:-}"
OUT="${2:-}"
[[ -n "$VERSION" && -n "$OUT" ]] || {
  echo "usage: release/website-snapshot.sh <version> <out-dir> [<src-root>]" >&2
  exit 1
}
[[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || {
  echo "not a bare semver version: $VERSION" >&2
  exit 1
}

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC_ROOT="$(cd "${3:-$REPO_ROOT}" && pwd)"
BASE="/v/${VERSION}/"

# Backfill safety net: teach an older tag's config to honour VARAR_SITE_BASE.
# A no-op on any tag from this change onward.
node "$REPO_ROOT/release/website-ensure-base.mjs" \
  "$SRC_ROOT/typescript/packages/website/astro.config.mjs"

echo "building website snapshot v$VERSION under base $BASE (from $SRC_ROOT)"
(cd "$SRC_ROOT/typescript" && VARAR_SITE_BASE="$BASE" pnpm --filter @varar/website... build)

DIST="$SRC_ROOT/typescript/packages/website/dist"
node "$REPO_ROOT/release/website-rebase-links.mjs" "$DIST" "$BASE"

rm -rf "$OUT"
mkdir -p "$OUT"
cp -R "$DIST/." "$OUT/"
echo "snapshot v$VERSION written to $OUT"
