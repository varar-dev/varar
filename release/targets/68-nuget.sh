#!/usr/bin/env bash
# Pack every Varar .NET package, and push it to nuget.org when
# DOTNET_NUGET_AUTOPUBLISH=1. While that is 0 the packages are packed into
# release/dist/nuget/<version>/ and their paths printed, for upload by hand.
#
# The release does NOT wait for that upload. 72-varar-examples.sh runs later,
# pins the C# sample to this version and pushes it to varar-examples, so between
# the release and the manual upload that sample's check is red; re-run the
# workflow once the packages are up. That is a deliberate trade — see
# DOTNET_ENABLED in release/lib.sh.
#
# Go-live checklist for pushing automatically (DOTNET_NUGET_AUTOPUBLISH=1):
#   1. Create a nuget.org API key scoped to the Varar* package ids.
#   2. Store it in 1Password and add NUGET_API_KEY to release/release.env.
#   3. Set DOTNET_NUGET_AUTOPUBLISH=1 in release/lib.sh.
# Packaging metadata (description, license, readme, …) is already set — see
# dotnet/Directory.Build.props.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/../lib.sh"
VERSION="$1"

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

# 0 iff <id> at $VERSION is on nuget.org. The flat container is the index the
# restore path actually reads, so this answers the question the C# sample asks,
# not merely whether the upload form has seen the file.
nuget_published() {
  local id_lower
  id_lower="$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]')"
  curl -fsSL "https://api.nuget.org/v3-flatcontainer/$id_lower/index.json" 2>/dev/null |
    jq -e --arg v "$VERSION" '.versions | index($v) != null' >/dev/null 2>&1
}

# Persistent (release/dist is gitignored, same place the .vsix is built) so the
# packages survive the run and can be uploaded by hand.
pack_dir="$REPO_ROOT/release/dist/nuget/$VERSION"

if [[ "${DRY_RUN:-0}" == "1" ]]; then
  for name in "${packages[@]}"; do
    if [[ "$DOTNET_NUGET_AUTOPUBLISH" == "1" ]]; then
      log "nuget: would pack + push $name $VERSION"
    else
      log "nuget: would pack $name $VERSION to $pack_dir for manual upload"
    fi
  done
  exit 0
fi

missing=()
for name in "${packages[@]}"; do
  nuget_published "$name" || missing+=("$name")
done
if [[ ${#missing[@]} -eq 0 ]]; then
  log "nuget: all packages already on nuget.org at $VERSION"
  exit 0
fi

mkdir -p "$pack_dir"
for name in "${packages[@]}"; do
  dotnet pack "$name/$name.csproj" -c Release -p:Version="$VERSION" -o "$pack_dir" >/dev/null
done

if [[ "$DOTNET_NUGET_AUTOPUBLISH" == "1" ]]; then
  for name in "${missing[@]}"; do
    # nuget.org de-dupes by (id, version): a re-push of an existing version is a
    # 409, so --skip-duplicate makes the whole target idempotent on rerun.
    dotnet nuget push "$pack_dir/$name.$VERSION.nupkg" \
      --source https://api.nuget.org/v3/index.json \
      --api-key "$NUGET_API_KEY" \
      --skip-duplicate
    log "nuget: published $name $VERSION"
  done
  log "nuget: done"
  exit 0
fi

warn "nuget: automatic publishing is off — upload these to https://www.nuget.org/packages/manage/upload"
for name in "${missing[@]}"; do
  log "nuget:   $pack_dir/$name.$VERSION.nupkg"
done
warn "nuget: varar-examples' csharp-vstest check stays red until they are up — re-run that workflow after uploading"
log "nuget: done (packed, not published)"
