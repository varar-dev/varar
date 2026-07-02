#!/usr/bin/env bash
# Publish every non-private workspace package to npm. Idempotent per package.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/../lib.sh"
VERSION="$1"

# pnpm refuses env-expanded auth from a committed project .npmrc, so write
# the token to an ephemeral user-level config for the duration of this run.
npmrc_tmp="$(mktemp)"
trap 'rm -f "$npmrc_tmp"' EXIT
printf '//registry.npmjs.org/:_authToken=%s\n' "${NPM_TOKEN}" >"$npmrc_tmp"
export NPM_CONFIG_USERCONFIG="$npmrc_tmp"

cd "$REPO_ROOT/typescript"

pnpm install --frozen-lockfile
pnpm build

# The npm account keeps 2FA on publishes (deliberately — no bypass-2FA token).
# npm's own web flow handles it: on an interactive terminal, an EOTP-guarded
# publish opens https://www.npmjs.com/auth/cli/... in the browser, where the
# 2FA challenge is answered with 1Password/passkey — no typed OTP (this is
# what release-it rides on too). npm only offers it when BOTH stdin and stdout
# are TTYs (lib/utils/auth.js), and `op run` pipes our stdio to mask secrets,
# so rebind the publish command to /dev/tty. Expect one browser round-trip per
# package being published.
require_tty() {
  { : </dev/tty; } 2>/dev/null ||
    die "npm: publishing needs a terminal for npm's browser-based 2FA — run the release interactively"
}

published=0 skipped=0
for pkgjson in packages/*/package.json; do
  name="$(jq -r .name "$pkgjson")"
  [[ "$(jq -r '.private // false' "$pkgjson")" == "true" ]] && continue
  if npm view "$name@$VERSION" version >/dev/null 2>&1; then
    log "npm: $name@$VERSION already published"
    skipped=$((skipped + 1))
    continue
  fi
  if [[ "${DRY_RUN:-0}" == "1" ]]; then
    log "npm: would publish $name@$VERSION"
    continue
  fi
  require_tty
  (cd "$(dirname "$pkgjson")" &&
    pnpm publish --access public --no-git-checks </dev/tty >/dev/tty 2>/dev/tty)
  log "npm: published $name@$VERSION"
  published=$((published + 1))
done
log "npm: done ($published published, $skipped already present)"
