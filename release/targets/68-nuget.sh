#!/usr/bin/env bash
# Publish every Varar .NET package to NuGet. Idempotent per package.
#
# PARKED until the .NET port is ready to ship (gated by DOTNET_NUGET_ENABLED in
# release/lib.sh, which keeps this target and the 70-varar-examples.sh csharp
# pin in lock-step). While parked this simply reports OK. Go-live checklist:
#   1. Verify the package ids below are free on nuget.org (`Varar`, `Varar.*`),
#      then give each dotnet/*.csproj its packaging metadata — PackageId,
#      Authors, Description, PackageLicenseExpression, RepositoryUrl — and mark
#      the shipping projects packable (the test projects stay IsPackable=false).
#   2. Version the port at release time: the stamper does not touch dotnet/ yet,
#      so wire <Version> stamping (release/stamp.sh) — they carry no version
#      today, defaulting to 1.0.0.
#   3. Add `dotnet` to the consumer scopes in release/lint-commits.sh and a
#      NuGet section to cliff.toml (keyed on the `dotnet` scope), so
#      feat(dotnet): commits land in the changelog. Until then dotnet work is
#      chore(dotnet): — it ships nothing to a consumer yet.
#   4. Add the NUGET_API_KEY reference to release/release.env.
#   5. Set DOTNET_NUGET_ENABLED=1 in release/lib.sh (un-parks this target AND
#      the varar-examples csharp pin together).
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/../lib.sh"
VERSION="$1"

if [[ "$DOTNET_NUGET_ENABLED" != "1" ]]; then
  warn "nuget: target parked (DOTNET_NUGET_ENABLED=0) — see the header in ${BASH_SOURCE[0]} to enable"
  exit 0
fi

require_tool dotnet
cd "$REPO_ROOT/dotnet"

# The shipping packages, in dependency order (Core first). The two test
# projects (Varar.Core.Tests, Varar.Tests) are IsPackable=false and never ship.
packages=(
  Varar.Core
  Varar.Config
  Varar
  Varar.Runner
  Varar.TestAdapter
)

pack_dir="$(mktemp -d)"
trap 'rm -rf "$pack_dir"' EXIT

for name in "${packages[@]}"; do
  # nuget.org de-dupes by (id, version): a re-push of an existing version is a
  # 409, so --skip-duplicate makes the whole target idempotent on rerun.
  if [[ "${DRY_RUN:-0}" == "1" ]]; then
    log "nuget: would pack + push $name $VERSION"
    continue
  fi
  dotnet pack "$name/$name.csproj" -c Release -p:Version="$VERSION" -o "$pack_dir"
  dotnet nuget push "$pack_dir/$name.$VERSION.nupkg" \
    --source https://api.nuget.org/v3/index.json \
    --api-key "$NUGET_API_KEY" \
    --skip-duplicate
  log "nuget: published $name $VERSION"
done
log "nuget: done"
