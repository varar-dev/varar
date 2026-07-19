package varconfig_test

import (
	"os"
	"path/filepath"
	"sort"
	"testing"

	varconfig "github.com/varar-dev/varar-go/config"
	vc "github.com/varar-dev/varar-go/core"
)

// The var-config conformance corpus at conformance/config/cases/*: each case has
// a varar.config.json plus either a golden.json (parse succeeds → project to the
// canonical shape, canonical-serialize, byte-compare) or an expect-error.txt
// marker (loading must fail; the txt is human-only, not asserted).

func casesDir() string { return filepath.Join("..", "..", "conformance", "config", "cases") }

func strList(ss []string) vc.Value {
	vs := make([]vc.Value, len(ss))
	for i, s := range ss {
		vs[i] = vc.StrValue(s)
	}
	return vc.ListOf(vs)
}

func toConfigArtifact(cfg varconfig.VarConfig) vc.Value {
	snippets := map[string]vc.Value{}
	for k, v := range cfg.Snippets {
		snippets[k] = vc.StrValue(v)
	}
	docs := vc.MapValue(map[string]vc.Value{
		"include": strList(cfg.DocsInclude),
		"exclude": strList(cfg.DocsExclude),
	})
	return vc.MapValue(map[string]vc.Value{
		"docs":           docs,
		"steps":          strList(cfg.Steps),
		"snippets":       vc.MapValue(snippets),
		"scannerPlugins": strList(cfg.ScannerPlugins),
	})
}

func TestConfigConformance(t *testing.T) {
	entries, err := os.ReadDir(casesDir())
	if err != nil {
		t.Fatalf("read cases: %v", err)
	}
	var names []string
	for _, e := range entries {
		if e.IsDir() {
			names = append(names, e.Name())
		}
	}
	sort.Strings(names)

	for _, name := range names {
		t.Run(name, func(t *testing.T) {
			dir := filepath.Join(casesDir(), name)
			if _, err := os.Stat(filepath.Join(dir, "expect-error.txt")); err == nil {
				if _, err := varconfig.ReadVarConfig(dir); err == nil {
					t.Errorf("%s: expected an error, got none", name)
				}
				return
			}
			goldenBytes, err := os.ReadFile(filepath.Join(dir, "golden.json"))
			if err != nil {
				t.Fatalf("%s: no golden.json and no expect-error.txt", name)
			}
			cfg, err := varconfig.ReadVarConfig(dir)
			if err != nil {
				t.Fatalf("%s: unexpected error: %v", name, err)
			}
			actual := vc.CanonicalStringify(toConfigArtifact(cfg))
			if actual != string(goldenBytes) {
				t.Errorf("%s: golden mismatch\n--- got ---\n%s\n--- want ---\n%s", name, actual, string(goldenBytes))
			}
		})
	}
}
