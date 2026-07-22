#!/usr/bin/env bash
# Stamp <version> into every manifest of every port. Idempotent.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
cd "$REPO_ROOT"

VERSION="${1:-}"
[[ -n "$VERSION" ]] || die "usage: release/stamp.sh <version>"
is_semver "$VERSION" || die "not a semver version: $VERSION"

log "stamping TypeScript packages"
node -e '
const fs = require("node:fs"), path = require("node:path");
const version = process.argv[1];
// A single quote, spelled so this script can stay inside single quotes in sh.
const q = "\x27";
// Packages also EXPORT their version as a constant. The pure core does no file
// I/O, so it cannot read package.json at runtime — the source is stamped here
// alongside the manifest instead. Idempotent: the pattern matches its own
// output, so re-stamping the same version is a no-op.
const versionRe = new RegExp(
  "^export const VERSION = " + q + "[^" + q + "]*" + q + "$",
  "m",
);
for (const dir of fs.readdirSync("typescript/packages")) {
  const file = path.join("typescript/packages", dir, "package.json");
  if (fs.existsSync(file)) {
    const pkg = JSON.parse(fs.readFileSync(file, "utf8"));
    if (pkg.version !== version) {
      pkg.version = version;
      fs.writeFileSync(file, JSON.stringify(pkg, null, 2) + "\n");
    }
  }
  const entry = path.join("typescript/packages", dir, "src/index.ts");
  if (!fs.existsSync(entry)) continue;
  const src = fs.readFileSync(entry, "utf8");
  const next = src.replace(versionRe, "export const VERSION = " + q + version + q);
  if (next !== src) fs.writeFileSync(entry, next);
}
' "$VERSION"

log "stamping Python packages (+ pinning internal deps)"
python3 release/stamp_python.py "$VERSION"
(cd python && uv lock --quiet)

log "stamping Java modules"
(cd java && mvn --batch-mode --quiet versions:set -DnewVersion="$VERSION" -DgenerateBackupPoms=false)

log "stamping Java sample projects"
stamp_java_samples "$VERSION"

log "stamping Ruby gems (+ pinning internal deps, relocking)"
stamp_ruby "$VERSION"

log "stamping Rust crates (+ pinning internal deps, relocking)"
stamp_rust "$VERSION"

log "stamped $VERSION"
