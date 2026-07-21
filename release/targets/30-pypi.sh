#!/usr/bin/env bash
# Publish every Python workspace package to PyPI. Idempotent per package.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/../lib.sh"
VERSION="$1"

# Live since v0.3.1 (2026-07-06): every workspace package publishes on each
# release. Flip to 1 to park the target (it then warns and reports OK).
DISABLED=0
if [[ "$DISABLED" == "1" ]]; then
  warn "pypi: target disabled — flip DISABLED=0 in ${BASH_SOURCE[0]} to re-enable"
  exit 0
fi

cd "$REPO_ROOT/python"

trap 'rm -rf "$REPO_ROOT/python/dist-release"' EXIT

rm -rf dist-release
published=0 skipped=0
# Failures are collected rather than fatal, so one package cannot mask the
# others. PyPI rate-limits NEW project creation per account ("429 Too many new
# projects created"), which the varar rename hit: aborting on the first 429
# meant the packages after it were never even attempted, so each re-run
# uncovered one more failure instead of the whole set. Every publish here is
# independently idempotent, so continuing is safe.
failed=()
for pyproject in packages/*/pyproject.toml; do
  name="$(python3 -c "import tomllib, sys; print(tomllib.load(open(sys.argv[1], 'rb'))['project']['name'])" "$pyproject")"
  if http_ok "https://pypi.org/pypi/$name/$VERSION/json"; then
    log "pypi: $name==$VERSION already published"
    skipped=$((skipped + 1))
    continue
  fi
  if [[ "${DRY_RUN:-0}" == "1" ]]; then
    log "pypi: would publish $name==$VERSION"
    continue
  fi
  if uv build --package "$name" -o "dist-release/$name" && uv publish "dist-release/$name"/*; then
    log "pypi: published $name==$VERSION"
    published=$((published + 1))
  else
    warn "pypi: FAILED to publish $name==$VERSION — continuing with the rest"
    failed+=("$name")
  fi
done
rm -rf dist-release
log "pypi: done ($published published, $skipped already present, ${#failed[@]} failed)"
if [[ ${#failed[@]} -gt 0 ]]; then
  die "pypi: could not publish: ${failed[*]} — a 429 here is PyPI's new-project rate limit, not credentials; wait and re-run (published packages are skipped)"
fi
