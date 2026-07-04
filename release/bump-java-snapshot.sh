#!/usr/bin/env bash
# Move the Java port (and the version its sample projects consume) to the next
# patch SNAPSHOT — the "this is trunk, not a release" placeholder that keeps a
# local `mvn install` from shadowing the immutable release in ~/.m2. The
# placeholder never ships anywhere: the real next version is inferred from
# conventional commits at release time and release/stamp.sh overwrites this.
#
# versions:set -DnextSnapshot=true computes the bump itself (increments the
# smallest segment, appends -SNAPSHOT: 0.3.0 -> 0.3.1-SNAPSHOT); the samples
# just need their varVersion pointed at whatever it produced.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
cd "$REPO_ROOT"

(cd java && mvn --batch-mode --quiet versions:set -DnextSnapshot=true -DgenerateBackupPoms=false)
SNAPSHOT="$(cd java && mvn --batch-mode --quiet help:evaluate -Dexpression=project.version -DforceStdout)"
[[ "$SNAPSHOT" == *-SNAPSHOT ]] || die "expected a -SNAPSHOT version after the bump, got: $SNAPSHOT"
stamp_java_samples "$SNAPSHOT"
log "java at $SNAPSHOT"
