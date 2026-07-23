package runner_test

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/varar-dev/varar/go/config"
	"github.com/varar-dev/varar/go/core"
	"github.com/varar-dev/varar/go/runner"
)

func TestGlobStarStaysWithinOneSegment(t *testing.T) {
	re := runner.GlobToRegex("*.md")
	if !re.MatchString("a.md") {
		t.Error("should match a.md")
	}
	if re.MatchString("sub/a.md") {
		t.Error("should not match sub/a.md")
	}
}

func TestLeadingDoublestarMatchesZeroOrMoreSegments(t *testing.T) {
	re := runner.GlobToRegex("**/*.md")
	for _, p := range []string{"a.md", "sub/a.md", "x/y/a.md"} {
		if !re.MatchString(p) {
			t.Errorf("should match %s", p)
		}
	}
}

func TestNestedAndTrailingDoublestar(t *testing.T) {
	if !runner.GlobToRegex("oaths/**/*.md").MatchString("oaths/a.md") {
		t.Error("oaths/a.md")
	}
	if !runner.GlobToRegex("oaths/**/*.md").MatchString("oaths/x/a.md") {
		t.Error("oaths/x/a.md")
	}
	wip := runner.GlobToRegex("oaths/wip/**")
	if !wip.MatchString("oaths/wip") {
		t.Error("oaths/wip")
	}
	if !wip.MatchString("oaths/wip/draft.md") {
		t.Error("oaths/wip/draft.md")
	}
}

func TestFindOathsHonoursIncludeAndExclude(t *testing.T) {
	root := t.TempDir()
	os.WriteFile(filepath.Join(root, "a.md"), []byte("x"), 0o644)
	os.WriteFile(filepath.Join(root, "README.md"), []byte("x"), 0o644)
	os.MkdirAll(filepath.Join(root, "sub"), 0o755)
	os.WriteFile(filepath.Join(root, "sub", "b.md"), []byte("x"), 0o644)

	flat := config.VarConfig{DocsInclude: []string{"*.md"}, DocsExclude: []string{"README.md"}}
	oaths := runner.FindOaths(flat, root)
	if len(oaths) != 1 || filepath.Base(oaths[0]) != "a.md" {
		t.Errorf("flat: got %v", oaths)
	}

	recursive := config.VarConfig{DocsInclude: []string{"**/*.md"}, DocsExclude: []string{"README.md"}}
	if got := runner.FindOaths(recursive, root); len(got) != 2 {
		t.Errorf("recursive: got %v", got)
	}
}

func TestBaselineStoreRoundTripsAndReconcileWritesLock(t *testing.T) {
	root := t.TempDir()
	store := runner.NewFileBaselineStore(root)
	if _, ok := store.Read(); ok {
		t.Error("expected no baseline initially")
	}

	k := core.Stimulus
	registry, err := core.AddStep(core.CreateRegistry(), "I greet {string}", "s.go", 1,
		core.NewHandler(func(state any, args []core.Value) (any, error) { return state, nil }), &k)
	if err != nil {
		t.Fatal(err)
	}
	source := "# Hi\n\nI greet \"world\"."
	doc := core.Parse("hi.md", source)
	execution := core.Plan(doc, registry)

	drifts := core.ReconcileDrift(store, "hi.md", source, doc, execution, false)
	if len(drifts) != 0 {
		t.Errorf("expected no drift, got %v", drifts)
	}
	if _, ok := store.Read(); !ok {
		t.Error("varar.lock.json should be written")
	}
	if _, err := os.Stat(filepath.Join(root, "varar.lock.json")); err != nil {
		t.Error("varar.lock.json should exist")
	}
}
