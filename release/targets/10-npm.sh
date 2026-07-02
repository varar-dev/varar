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

# The npm account keeps 2FA on publishes (deliberately — no bypass-2FA token),
# so every publish needs a one-time password. Prompt on the terminal directly
# (`/dev/tty`, since op run owns stdin) right before the first publish, reuse
# the code while it stays valid, and re-prompt once per package if it expires
# mid-run.
NPM_OTP=""
prompt_otp() {
  { : </dev/tty; } 2>/dev/null ||
    die "npm: publishing requires an interactive OTP prompt, but there is no terminal"
  IFS= read -r -p "npm: one-time password (2FA): " NPM_OTP </dev/tty >/dev/tty
  [[ -n "$NPM_OTP" ]] || die "npm: empty OTP"
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
  [[ -n "$NPM_OTP" ]] || prompt_otp
  if ! (cd "$(dirname "$pkgjson")" && pnpm publish --access public --no-git-checks --otp "$NPM_OTP"); then
    warn "npm: publish of $name failed — if the OTP expired, enter a fresh one"
    prompt_otp
    (cd "$(dirname "$pkgjson")" && pnpm publish --access public --no-git-checks --otp "$NPM_OTP")
  fi
  log "npm: published $name@$VERSION"
  published=$((published + 1))
done
log "npm: done ($published published, $skipped already present)"
