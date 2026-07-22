#!/usr/bin/env bash
# Publish every Rust workspace crate to crates.io. Idempotent.
#
# Gated by CRATES_IO_ENABLED in release/lib.sh, which keeps this target and the
# 72-varar-examples.sh rust pin in lock-step: while it is 0 nothing publishes
# AND the rust-* samples stay out of the examples sync (their path dependency
# cannot resolve there until the crates are on crates.io).
#
# Publishing is one `cargo publish --workspace`, not a per-crate loop. Cargo
# works out the dependency order itself and resolves the not-yet-published
# members through a temporary local registry, so the crates do not have to
# appear on crates.io one index-propagation at a time. (The per-crate loop this
# replaced also had the directory names wrong — it cd'd to `varar-core` rather
# than `core`.)
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/../lib.sh"
VERSION="$1"

if [[ "$CRATES_IO_ENABLED" != "1" ]]; then
  warn "crates-io: target parked (CRATES_IO_ENABLED=0) — see the header in ${BASH_SOURCE[0]} to enable"
  exit 0
fi

require_tool cargo
cd "$REPO_ROOT/rust"

# Every published crate, in dependency order (only used for the partial-resume
# path below; a full run lets cargo order them).
crates=(varar-core varar-config varar varar-runner varar-cargotest)

# crates.io is the source of truth for "already published" — the registry API,
# not `cargo search`, which prefix-matches and reports only the max version.
published=() missing=()
for name in "${crates[@]}"; do
  if http_ok "https://crates.io/api/v1/crates/$name/$VERSION"; then
    published+=("$name")
  else
    missing+=("$name")
  fi
done

if [[ ${#missing[@]} -eq 0 ]]; then
  log "crates-io: all crates already published at $VERSION"
  exit 0
fi

if [[ "${DRY_RUN:-0}" == "1" ]]; then
  log "crates-io: would publish ${missing[*]} at $VERSION (verifying with a dry-run publish)"
  cargo publish --dry-run --workspace >/dev/null
  log "crates-io: dry-run publish OK"
  exit 0
fi

# A crate version on crates.io is immutable (it can be yanked, never replaced),
# so a re-run must never try to re-upload one. `cargo publish --workspace` has
# no skip-existing, hence the split: publish the whole workspace only when
# nothing is up yet, and otherwise push just the missing crates in dependency
# order — by then their dependencies are already on the registry, so each
# resolves normally.
if [[ ${#published[@]} -eq 0 ]]; then
  cargo publish --workspace
  log "crates-io: published ${crates[*]} at $VERSION"
else
  warn "crates-io: resuming — already published: ${published[*]}"
  for name in "${missing[@]}"; do
    cargo publish -p "$name"
    log "crates-io: published $name $VERSION"
  done
fi
log "crates-io: done"
