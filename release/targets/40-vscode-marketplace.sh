#!/usr/bin/env bash
# Publish the extension to the VS Code Marketplace. Idempotent.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/../lib.sh"
VERSION="$1"

if vsce show oselvar.oselvar-var --json 2>/dev/null \
    | jq -e --arg v "$VERSION" '[.versions[]?.version] | index($v) != null' >/dev/null; then
  log "marketplace: oselvar.oselvar-var $VERSION already published"
  exit 0
fi
if [[ "${DRY_RUN:-0}" == "1" ]]; then
  log "marketplace: would build .vsix and publish $VERSION"
  exit 0
fi
vsix="$(build_vsix "$VERSION")"
vsce publish --packagePath "$vsix"
log "marketplace: published $VERSION"
