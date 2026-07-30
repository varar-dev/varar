#!/usr/bin/env bash
# Every capability conformance/parity.json declares must exist in every port it
# names — and every port must be named by every capability that isn't marked
# single-port with a reason.
#
# The corpora catch a port that BEHAVES differently. Nothing caught a port that
# simply never implemented something: `result` and `failure` lived in four ports
# for months because no golden mentioned them (ADR 0014). This is the cheap net
# for that class — whole-capability omissions, not field-level drift.
#
#   release/check-parity.sh
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
cd "$REPO_ROOT"

MANIFEST=conformance/parity.json
command -v jq >/dev/null || die "jq is required for $MANIFEST"

fail=0
complain() { warn "$1"; fail=1; }

# bash 3.2 (what macOS ships) has no mapfile — read into arrays the long way.
ALL_PORTS=()
while read -r port; do ALL_PORTS+=("$port"); done < <(jq -r '.ports | keys[]' "$MANIFEST")

# A capability listing fewer ports than exist is fine ONLY with a stated reason:
# that turns "nobody got round to it" into a decision someone wrote down.
while read -r name; do
  why="$(jq -r --arg n "$name" '.capabilities[] | select(.name==$n) | .why // ""' "$MANIFEST")"
  listed=()
  while read -r port; do listed+=("$port"); done < <(jq -r --arg n "$name" '.capabilities[] | select(.name==$n) | .files | keys[]' "$MANIFEST")

  missing=()
  for port in "${ALL_PORTS[@]}"; do
    [[ " ${listed[*]} " == *" $port "* ]] || missing+=("$port")
  done
  if [[ ${#missing[@]} -gt 0 && -z "$why" ]]; then
    complain "capability '$name' is missing from: ${missing[*]} — implement it there, or add a \"why\" to $MANIFEST saying which ports it belongs to and for what reason"
  fi

  # Every path it DOES declare has to be real, or the manifest is fiction.
  for port in "${listed[@]}"; do
    dir="$(jq -r --arg p "$port" '.ports[$p]' "$MANIFEST")"
    file="$(jq -r --arg n "$name" --arg p "$port" '.capabilities[] | select(.name==$n) | .files[$p]' "$MANIFEST")"
    [[ -f "$dir/$file" ]] ||
      complain "capability '$name' claims $dir/$file for $port, which does not exist — move the file back, or update $MANIFEST"
  done
done < <(jq -r '.capabilities[].name' "$MANIFEST")

[[ "$fail" == "0" ]] || die "port parity check failed"
log "port parity OK ($(jq -r '.capabilities | length' "$MANIFEST") capabilities × ${#ALL_PORTS[@]} ports)"
