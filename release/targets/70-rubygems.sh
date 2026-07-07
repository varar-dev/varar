#!/usr/bin/env bash
# Publish every Ruby workspace gem to RubyGems. Idempotent per gem.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/../lib.sh"
VERSION="$1"

# Live from the first Ruby release: every workspace gem publishes on each
# release. Flip to 1 to park the target (it then warns and reports OK).
DISABLED=0
if [[ "$DISABLED" == "1" ]]; then
  warn "rubygems: target disabled — flip DISABLED=0 in ${BASH_SOURCE[0]} to re-enable"
  exit 0
fi

cd "$REPO_ROOT/ruby"

# Publish in dependency order so a gem's deps exist when it is pushed.
gems=(
  oselvar-var-core
  oselvar-var-config
  oselvar-var
  oselvar-var-runner
  oselvar-var-rspec
  oselvar-var-minitest
)

trap 'rm -f "$REPO_ROOT"/ruby/packages/*/*.gem' EXIT

published=0 skipped=0
for name in "${gems[@]}"; do
  pkg="packages/${name#oselvar-}"
  # RubyGems returns 200 for a published version, 404 otherwise.
  if http_ok "https://rubygems.org/api/v1/versions/$name.json" \
     && gem list -r -e "$name" | grep -q "($VERSION"; then
    log "rubygems: $name $VERSION already published"
    skipped=$((skipped + 1))
    continue
  fi
  if [[ "${DRY_RUN:-0}" == "1" ]]; then
    log "rubygems: would publish $name $VERSION"
    continue
  fi
  (cd "$pkg" && gem build "$name.gemspec" -o "$name-$VERSION.gem" && gem push "$name-$VERSION.gem")
  log "rubygems: published $name $VERSION"
  published=$((published + 1))
done
log "rubygems: done ($published published, $skipped already present)"
