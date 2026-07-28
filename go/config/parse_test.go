package config

import (
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

// ReadVarConfig is the filesystem edge over ParseVarConfig (issue #11). These
// pin the pure half directly: a caller holding the text — an editor buffer, the
// LSP, an in-memory fixture — must be able to validate it without inventing a
// file. Byte-for-byte behaviour of both is gated by conformance_test.go.

func TestParseReadsEveryKeyWithoutTouchingTheFilesystem(t *testing.T) {
	cfg, err := ParseVarConfig([]byte(`{"docs": {"include": ["a/**/*.md"], "exclude": ["a/wip/**"]},
		"steps": ["*.steps.go"], "snippets": {"go": "G"}}`), "<memory>")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !reflect.DeepEqual(cfg.DocsInclude, []string{"a/**/*.md"}) {
		t.Errorf("DocsInclude = %v", cfg.DocsInclude)
	}
	if !reflect.DeepEqual(cfg.DocsExclude, []string{"a/wip/**"}) {
		t.Errorf("DocsExclude = %v", cfg.DocsExclude)
	}
	if !reflect.DeepEqual(cfg.Steps, []string{"*.steps.go"}) {
		t.Errorf("Steps = %v", cfg.Steps)
	}
	if cfg.Snippets["go"] != "G" {
		t.Errorf("Snippets = %v", cfg.Snippets)
	}
}

func TestParseLabelsErrorsWithTheGivenSource(t *testing.T) {
	_, err := ParseVarConfig([]byte("{oops"), "buffer://untitled")
	if err == nil || !strings.HasPrefix(err.Error(), "buffer://untitled:") {
		t.Errorf("unexpected error: %v", err)
	}
}

func TestReadReturnsTheEmptyConfigWhenThereIsNoFile(t *testing.T) {
	cfg, err := ReadVarConfig(t.TempDir())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !reflect.DeepEqual(cfg, Default()) {
		t.Errorf("got %v, want %v", cfg, Default())
	}
}

func TestReadDelegatesToParseAndLabelsErrorsWithThePath(t *testing.T) {
	root := t.TempDir()
	if err := os.WriteFile(filepath.Join(root, "varar.config.json"), []byte("{oops"), 0o644); err != nil {
		t.Fatal(err)
	}

	_, err := ReadVarConfig(root)
	if err == nil || !strings.Contains(err.Error(), "varar.config.json") {
		t.Errorf("unexpected error: %v", err)
	}
}
