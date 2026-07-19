#!/usr/bin/env bash
#
# Install every asdf-managed toolchain the repo pins, straight from the root
# .tool-versions — adding any missing asdf plugin first. Idempotent: already
# installed plugins/versions are skipped.
#
# The examples/ projects deliberately build against an older LTS (JDK 21, Ruby
# 3.2) and pin it in their own .tool-versions; those versions ride along on the
# root file's multi-version lines, so this one pass installs them too.
#
# Not handled here (not asdf-managed): Rust — rustup, via rust/rust-toolchain.toml
# (`rustup show` installs the pinned toolchain; `cargo install cargo-llvm-cov` is
# needed for `make coverage`); Node — corepack, via typescript/package.json.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if ! command -v asdf >/dev/null 2>&1; then
  echo "asdf not found — install it first: https://asdf-vm.com" >&2
  exit 1
fi

installed_plugins="$(asdf plugin list 2>/dev/null || true)"

# Read the root .tool-versions line by line. Each line is "<tool> <version>...";
# lines may list several versions (the first is the default, the rest are the
# example LTSes). Comments (#) and blank lines are skipped.
while read -r tool versions; do
  [ -z "${tool:-}" ] && continue
  case "$tool" in \#*) continue ;; esac

  if ! printf '%s\n' "$installed_plugins" | grep -qx "$tool"; then
    echo "==> adding asdf plugin: $tool"
    asdf plugin add "$tool"
  fi

  for version in $versions; do
    echo "==> installing $tool $version"
    asdf install "$tool" "$version"
  done
done < "$ROOT/.tool-versions"

echo "All asdf toolchains from .tool-versions are installed."
