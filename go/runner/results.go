package runner

import (
	"encoding/json"
	"os"
	"path/filepath"

	"github.com/varar-dev/varar/go/core"
)

// Persists run results for the language server (ADR 0014) — the shell half of
// the contract the core builds the payload for. Writes
// <root>/.varar/<oathPath>.json, which the (language-neutral) LSP reads to turn
// a failure into an editor diagnostic.
//
// Lives in the runner so every adapter in this port feeds the same collector
// and cannot drift from the TypeScript reporter this is a port of.

// ResultFilePath is <root>/.varar/<oathPath>.json — the file the LSP watches.
func ResultFilePath(root, oathPath string) string {
	return filepath.Join(root, ".varar", filepath.FromSlash(oathPath)+".json")
}

// WriteOathResults writes one oath's results: 2-space indent plus a trailing
// newline, matching JSON.stringify(results, null, 2) in the TypeScript port.
// SetEscapeHTML(false) is what keeps <, > and & raw the way JSON.stringify
// leaves them; the struct tags in core/result.go fix the field names and order.
func WriteOathResults(root string, results core.OathResults) (string, error) {
	out := ResultFilePath(root, results.OathPath)
	if err := os.MkdirAll(filepath.Dir(out), 0o755); err != nil {
		return "", err
	}
	var buf []byte
	encoded, err := marshalIndentNoEscape(results)
	if err != nil {
		return "", err
	}
	buf = append(encoded, '\n')
	if err := os.WriteFile(out, buf, 0o644); err != nil {
		return "", err
	}
	return out, nil
}

func marshalIndentNoEscape(value any) ([]byte, error) {
	var buf []byte
	writer := &sliceWriter{buf: &buf}
	encoder := json.NewEncoder(writer)
	encoder.SetEscapeHTML(false)
	encoder.SetIndent("", "  ")
	if err := encoder.Encode(value); err != nil {
		return nil, err
	}
	// Encode appends its own newline; WriteOathResults adds the one we want.
	return buf[:len(buf)-1], nil
}

type sliceWriter struct{ buf *[]byte }

func (w *sliceWriter) Write(p []byte) (int, error) {
	*w.buf = append(*w.buf, p...)
	return len(p), nil
}

// Results accumulates each oath's example results across a run, then writes
// them. `go test` reports test by test and has no end-of-run hook of its own,
// so the adapter flushes once every subtest has run — the first moment an
// oath's examples are all in. Passing oaths are written too: a stale file would
// keep a diagnostic on screen that the run has just cleared.
type Results struct {
	order    []string
	sources  map[string]string
	examples map[string][]core.ExampleResult
}

// NewResults is an empty collector.
func NewResults() *Results {
	return &Results{sources: map[string]string{}, examples: map[string][]core.ExampleResult{}}
}

// Record accumulates one example's outcome.
func (r *Results) Record(oathPath, source string, result core.ExampleResult) {
	if _, seen := r.sources[oathPath]; !seen {
		r.order = append(r.order, oathPath)
	}
	r.sources[oathPath] = source
	r.examples[oathPath] = append(r.examples[oathPath], result)
}

// FlushAll writes every oath held, and forgets them. Write errors are ignored
// on purpose: a read-only workspace must not fail a test run whose results are
// otherwise fine — the editor simply shows nothing for it.
func (r *Results) FlushAll(root string) {
	for _, oathPath := range r.order {
		examples := r.examples[oathPath]
		if len(examples) == 0 {
			continue
		}
		_, _ = WriteOathResults(root, core.OathResults{
			Version:    1,
			OathPath:   oathPath,
			SourceHash: core.HashSource(r.sources[oathPath]),
			Examples:   examples,
		})
	}
	r.order = nil
	r.sources = map[string]string{}
	r.examples = map[string][]core.ExampleResult{}
}
