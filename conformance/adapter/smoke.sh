#!/usr/bin/env bash
#
# The adapter smoke contract: proves a test-framework adapter is actually WIRED, not just
# conformance-green. See conformance/adapter/README.md for the rationale.
#
#   conformance/adapter/smoke.sh examples/go-gotest        # one project
#   conformance/adapter/smoke.sh --all                     # every registered project
#
# Run it AFTER the port's own suite in the same make target — the checks assume the sample
# project has just been built, so the two extra suite runs here are warm.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MANIFEST="$REPO_ROOT/conformance/adapter/projects.json"

red() { printf '\033[31m%s\033[0m\n' "$*" >&2; }
green() { printf '\033[32m%s\033[0m\n' "$*"; }

# The probe is injected into a tracked file, so it MUST be restored however we leave —
# including the failure paths, which exit rather than return.
DIRTIED_LOCK=""
restore_lock() {
  [ -n "$DIRTIED_LOCK" ] || return 0
  git -C "$REPO_ROOT" checkout --quiet -- "$DIRTIED_LOCK" 2>/dev/null || true
  DIRTIED_LOCK=""
}
trap restore_lock EXIT

fail() {
  red "FAIL  $1"
  shift
  for line in "$@"; do printf '      %s\n' "$line" >&2; done
  exit 1
}

pass() { green "  ok  $1"; }

command -v jq >/dev/null || fail "jq is required by the adapter smoke contract"

# Every sample project must be registered. A new port that adds examples/<lang>-<framework>/
# and forgets conformance/adapter/projects.json fails here — on the FIRST port's smoke run,
# not in review. This is the check that makes the contract self-extending.
assert_manifest_covers_examples() {
  local registered unregistered=""
  registered="$(jq -r '.projects[].dir' "$MANIFEST")"
  for config in "$REPO_ROOT"/examples/*/varar.config.json; do
    local dir
    dir="examples/$(basename "$(dirname "$config")")"
    grep -qxF "$dir" <<<"$registered" || unregistered="$unregistered $dir"
  done
  if [ -n "$unregistered" ]; then
    fail "conformance/adapter/projects.json does not cover every sample project" \
      "unregistered:$unregistered" \
      "Every adapter answers to the smoke contract — add an entry (see the \$comment in that file)."
  fi
}

# The oaths on disk, as POSIX paths relative to the project root.
oaths_on_disk() {
  local dir="$1" include
  # The contract locates oaths by convention rather than by implementing glob matching in bash.
  # Fail loudly if a project deviates, so the assumption stays explicit.
  include="$(jq -r '.docs.include | join(",")' "$REPO_ROOT/$dir/varar.config.json")"
  [ "$include" = "varar/**/*.md" ] || fail "$dir: the smoke contract assumes oaths live in varar/" \
    "varar.config.json docs.include is [$include]" \
    "Teach smoke.sh to glob, or move the oaths (see CLAUDE.md — 'varar means oaths')."
  (cd "$REPO_ROOT/$dir" && ls varar/*.md | sort)
}

run_contract() {
  local dir="$1"
  local abs="$REPO_ROOT/$dir"
  local lock="$abs/varar.lock.json"
  local project command baseline adapter
  project="$(jq -r --arg d "$dir" '.projects[] | select(.dir == $d)' "$MANIFEST")"
  [ -n "$project" ] || fail "$dir is not registered in conformance/adapter/projects.json"
  command="$(jq -r '.command' <<<"$project")"
  baseline="$(jq -r '.baseline' <<<"$project")"
  adapter="$(jq -r '.adapter' <<<"$project")"

  printf '\n%s (%s, baseline=%s)\n' "$dir" "$adapter" "$baseline"

  # Precondition: a lock that is already dirty makes every later diff meaningless.
  if ! git -C "$REPO_ROOT" diff --quiet -- "$dir/varar.lock.json" 2>/dev/null; then
    fail "$dir: varar.lock.json is already modified in the working tree" \
      "Commit or restore it before running the smoke contract."
  fi

  # 1. baseline-committed — the drift gate is armed by DATA. An adapter that reconciles
  #    perfectly still gates nothing if the project ships no baseline to reconcile against.
  if ! git -C "$REPO_ROOT" ls-files --error-unmatch "$dir/varar.lock.json" >/dev/null 2>&1; then
    fail "$dir: varar.lock.json is not committed" \
      "Run the suite once to record it, then commit it — without it the drift gate never fires."
  fi
  pass "baseline-committed"

  # 2. baseline-complete — one entry per oath. Catches an adapter whose discovery silently
  #    covers a subset (or nothing at all).
  local on_disk in_lock
  on_disk="$(oaths_on_disk "$dir")"
  in_lock="$(jq -r '.oaths | keys[]' "$lock" | sort)"
  if [ "$on_disk" != "$in_lock" ]; then
    fail "$dir: varar.lock.json does not cover every oath" \
      "on disk: $(tr '\n' ' ' <<<"$on_disk")" \
      "in lock: $(tr '\n' ' ' <<<"$in_lock")"
  fi
  pass "baseline-complete ($(wc -l <<<"$in_lock" | tr -d ' ') oaths)"

  # 3. drift-detected — record a prose paragraph in the baseline as though it had once been an
  #    example (what a renamed or deleted step definition leaves behind) and require the suite
  #    to go red. THIS is the check issue #69 would have failed.
  DIRTIED_LOCK="$dir/varar.lock.json"
  inject_probe "$lock"
  local output status
  output="$(cd "$abs" && eval "$command" 2>&1)" && status=0 || status=$?
  if [ "$status" -eq 0 ]; then
    fail "$dir: the suite PASSED with a drifted baseline — the drift gate is not wired" \
      "Command: $command" \
      "The adapter must reconcile every oath against varar.lock.json (ADR 0002)." \
      "See dotnet/Varar.TestAdapter/VararAdapter.cs for the most recent port to wire this."
  fi
  # The failure must be ATTRIBUTABLE to the probe, not just any red. Frameworks differ in what
  # they put on the console — surefire and pytest print the shared drift message, gradle prints
  # only the failing test's display name ("drift: <name>") — so require the two signals every
  # port emits one way or the other: the word "drift" and the probe's own name.
  local probe_name
  probe_name="$(jq -r '.probe.name' "$MANIFEST")"
  if ! grep -qF "drift" <<<"$output" || ! grep -qF "$probe_name" <<<"$output"; then
    fail "$dir: the suite failed, but not attributably on the drifted paragraph" \
      "Expected the output to name the drift and the paragraph: $probe_name" \
      "A failure for some other reason is not evidence the drift gate works." \
      "Got:" "$(tail -n 20 <<<"$output")"
  fi
  pass "drift-detected"

  # 4. drift-accepted — the acknowledgment path. ADR 0002 is only honest if drift can be
  #    accepted deliberately; an adapter that fails either way is unusable.
  output="$(cd "$abs" && VARAR_UPDATE=1 eval "$command" 2>&1)" && status=0 || status=$?
  if [ "$status" -ne 0 ]; then
    fail "$dir: VARAR_UPDATE=1 did not accept the drift" \
      "Command: VARAR_UPDATE=1 $command" \
      "Got:" "$(tail -n 20 <<<"$output")"
  fi
  if [ "$baseline" = "reconcile" ]; then
    # A reconciling adapter must have re-recorded the baseline — byte-identically to the
    # committed one, since accepting the probe just removes it again. This is what pins every
    # port to the same canonical varar.lock.json serializer.
    if ! git -C "$REPO_ROOT" diff --quiet -- "$dir/varar.lock.json"; then
      fail "$dir: VARAR_UPDATE=1 accepted the drift but did not re-record the baseline" \
        "$(git -C "$REPO_ROOT" diff -- "$dir/varar.lock.json" | head -n 30)"
    fi
    pass "drift-accepted (baseline re-recorded)"
  else
    pass "drift-accepted (read-only gate — baseline is written by \`varar run\`)"
  fi

  # Between projects, not just at exit — --all must not leave A's probe behind while B runs.
  restore_lock
}

# Add the probe to the lock: a baseline entry for a paragraph that is prose, not an example.
inject_probe() {
  local lock="$1" oath name line tmp
  oath="$(jq -r '.probe.oath' "$MANIFEST")"
  name="$(jq -r '.probe.name' "$MANIFEST")"
  line="$(jq -r '.probe.line' "$MANIFEST")"
  jq -e --arg o "$oath" '.oaths[$o]' "$lock" >/dev/null ||
    fail "$lock has no entry for the probe oath $oath"
  tmp="$(mktemp)"
  jq --indent 2 --arg o "$oath" --arg n "$name" --argjson l "$line" \
    '.oaths[$o].examples = ([{name: $n, line: $l}] + .oaths[$o].examples)' "$lock" >"$tmp"
  mv "$tmp" "$lock"
}

main() {
  assert_manifest_covers_examples
  # bash 3.2 (the macOS default) has no mapfile, and `set -u` trips on empty-array expansion.
  local dirs=()
  if [ $# -eq 0 ] || [ "${1:-}" = "--all" ]; then
    while IFS= read -r line; do dirs+=("$line"); done < <(jq -r '.projects[].dir' "$MANIFEST")
  else
    dirs=("$@")
  fi
  for dir in "${dirs[@]}"; do
    run_contract "${dir%/}"
  done
  printf '\n'
  green "adapter smoke contract: ${#dirs[@]} project(s) OK"
}

main "$@"
