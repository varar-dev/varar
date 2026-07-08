#!/usr/bin/env bash
# Regenerate CHANGELOG.md from conventional commit messages (see cliff.toml).
#
#   release/changelog.sh --preview  # print unreleased changes to stdout (no write)
#   release/changelog.sh v0.2.0     # fold unreleased commits into ## [0.2.0]
#
# CHANGELOG.md is written only at release time, by release/prepare.sh (which
# calls this with the release tag). Between releases, `--preview` shows what
# would land — nothing mutates the tracked file, and CI never touches it.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
cd "$REPO_ROOT"

require_tool git-cliff

if [[ "${1:-}" == "--preview" ]]; then
  generate_changelog
  exit 0
fi

tmp="$(mktemp)"
generate_changelog "${1:-}" > "$tmp"
mv "$tmp" CHANGELOG.md
log "regenerated CHANGELOG.md${1:+ for $1}"
