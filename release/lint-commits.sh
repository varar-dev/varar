#!/usr/bin/env bash
# Every commit since the last release tag must be a conventional commit,
# because CHANGELOG.md and the next version are GENERATED from commit
# messages (cliff.toml). See "Commit messages & changelog" in CLAUDE.md.
#
#   release/lint-commits.sh            # lint <last release tag>..HEAD
#   release/lint-commits.sh <range>    # lint an explicit range
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
cd "$REPO_ROOT"

RANGE="${1:-}"
if [[ -z "$RANGE" ]]; then
  latest="$(git describe --tags --abbrev=0 --match 'v[0-9]*' 2>/dev/null || true)"
  RANGE="${latest:+$latest..}HEAD"
fi

TYPES='feat|fix|perf|refactor|docs|test|build|ci|chore|style|revert'
CC_RE="^($TYPES)(\\(([^)]+)\\))?(!)?: .+$"
# feat/fix/perf and breaking commits become changelog entries; their scope
# decides which consumer section the entry lands in, so it must be one of
# these (optionally `/package`, e.g. ts/var-vitest). Work that ships nothing
# to a consumer (website, CI, tooling) is a chore/docs/build commit instead.
# The always-shipping consumer scopes; parked ports (below) join once live.
SCOPES=(ts py java ruby vscode spec)
# .NET is gated on DOTNET_ENABLED (lib.sh) — whether the packages are on
# nuget.org, not whether the release uploads them. They are (by hand), so
# `dotnet` is a changelog-visible consumer scope: the entries describe what
# reaches users, and users cannot tell who ran the upload.
[[ "${DOTNET_ENABLED:-0}" == "1" ]] && SCOPES+=(dotnet)
# Rust is gated the same way (CRATES_IO_ENABLED in lib.sh): `rust` is a
# changelog-visible consumer scope only once crates.io publishing is live, in
# lock-step with the 65-crates-io.sh target and the varar-examples rust pin.
[[ "${CRATES_IO_ENABLED:-0}" == "1" ]] && SCOPES+=(rust)
# Go is parked (GO_MODULES_ENABLED in lib.sh): `go` becomes a changelog-visible
# consumer scope only once module tag publishing goes live, in lock-step with
# the 71-go-modules.sh target and the varar-examples go pin. Until then Go work
# must be chore(go): — it ships nothing to a consumer.
[[ "${GO_MODULES_ENABLED:-0}" == "1" ]] && SCOPES+=(go)
CONSUMER_SCOPE="^($(IFS='|'; echo "${SCOPES[*]}"))(/[a-z0-9._-]+)?\$"

# Non-conventional commits already on main (pre-convention, or slipped in via
# a merged PR) — exempted because pushed history can't be reworded.
EXEMPT=(
  ff15b430dd3aad211e40f456407561ddd8066fae # Retire old website
  812cf1a8e2b16e9fcf07ea26e1c9b62bbff73e32 # Update lockfile
  970798caee2f4e3d85ff73dd0adc37ad6560e83f # Upgrade, edit links
  d7585cf409b0f9e7076ad0f27e22a3d07d2222ed # format (merged via PR #13)
  9b8d7c6f810340a410db13261ffa9a44c9a5cb31 # Update TODOs (non-CC, already on main)
  94860c91840f857e958090cf3a015794a5ab55e7 # Fix grammatical error in oaths.md (merged via PR #1)
  03a584045b20df3e6a7c1cd151911784d9fcb64b # Words (merged via PR #21)
  e0d3b835e76199fdcacfb422def8a1ee3d8ad524 # Words (merged via PR #21)
  7c950391b247e135db06ec9d6a723175dff7b9fe # Words (merged via PR #22)
  f587abf0471f4819d4db44d4b32da456bdb369fc # Rename secrets (non-CC, already on main)
)

# The `spec` scope claims "this changed for every port", so it is the one scope
# whose truth is checkable from the diff. A spec commit that lands in some ports
# and not others is how the ports drift apart without anyone noticing — the
# ported change looks finished in the log. Either touch every port, or say which
# ones you deferred and why:
#
#   Ports-deferred: ruby, dotnet, go — no run-result payload in those ports yet
#
# The trailer is the point: it makes divergence a decision on the record rather
# than an omission, and `git log --grep=Ports-deferred` lists the debt.
PORT_DIRS=(typescript python java ruby rust dotnet go)
# Kotlin lives in the java/ tree (java/kotlin, java/kotest) and needs no entry.

# Pushed (spec) commits that predate this rule and can't be reworded now.
PORTS_EXEMPT=(
  1afdf5cc01184f7fecda989e035fa90100474903 # anchor ports — its TypeScript half is f015d61b, the commit before
)

ports_touched() {
  local sha="$1" dir touched=()
  for dir in "${PORT_DIRS[@]}"; do
    git diff-tree --no-commit-id --name-only -r "$sha" -- "$dir" | grep -q . && touched+=("$dir")
  done
  echo "${touched[*]}"
}

fail=0
complain() { warn "$1  ($2: $3)"; fail=1; }

while IFS=$'\t' read -r sha subject; do
  [[ " ${EXEMPT[*]} " == *" $sha "* ]] && continue
  short="${sha:0:7}"
  # Release stamp commits are created by release.sh, not authored.
  [[ "$subject" =~ ^Release\ v[0-9] ]] && continue
  if [[ ! "$subject" =~ $CC_RE ]]; then
    complain "not a conventional commit (see CLAUDE.md)" "$short" "$subject"
    continue
  fi
  type="${BASH_REMATCH[1]}" scope="${BASH_REMATCH[3]}" bang="${BASH_REMATCH[4]}"
  breaking="$bang"
  [[ -z "$breaking" ]] && git log -1 --format=%b "$sha" | grep -q '^BREAKING[- ]CHANGE:' && breaking=1
  if [[ "$type" =~ ^(feat|fix|perf)$ || -n "$breaking" ]]; then
    [[ "$scope" =~ $CONSUMER_SCOPE ]] ||
      complain "changelog-visible commit needs a consumer scope (ts|py|java|ruby|vscode|spec, e.g. ts/var-vitest) — or use chore:/docs: if nothing shipped changes" "$short" "$subject"
  fi
  if [[ "$scope" == "spec" && " ${PORTS_EXEMPT[*]} " != *" $sha "* ]]; then
    touched="$(ports_touched "$sha")"
    missing=()
    for dir in "${PORT_DIRS[@]}"; do
      [[ " $touched " == *" $dir "* ]] || missing+=("$dir")
    done
    if [[ ${#missing[@]} -gt 0 ]] &&
      ! git log -1 --format=%b "$sha" | grep -qi '^Ports-deferred:'; then
      complain "(spec) claims every port but touched ${touched:-none} — port the rest, or add a 'Ports-deferred: ${missing[*]} — <why>' trailer" "$short" "$subject"
    fi
  fi
done < <(git log --no-merges --format=$'%H\t%s' "$RANGE")

[[ "$fail" == "0" ]] || die "commit lint failed for $RANGE"
log "commit lint OK ($RANGE)"
