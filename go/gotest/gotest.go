// Package gotest is the `go test` adapter (ADR 0011).
//
// Run turns every Markdown example matched by varar.config.json into one Go
// subtest (t.Run), reported/filtered/listed by `go test` like a native subtest,
// with failures rendered anchored to the .md source. Drift is reconciled on the
// main goroutine: a clean run rewrites varar.lock.json; VARAR_UPDATE=1 accepts
// drift instead of failing.
//
// Usage from a consumer's oaths_test.go:
//
//	func TestOaths(t *testing.T) {
//	    gotest.Run(t, ".", mysteps.BuildRegistry, mysteps.Context)
//	}
package gotest

import (
	"os"
	"path/filepath"
	"strconv"
	"testing"

	"github.com/varar-dev/varar/go/config"
	"github.com/varar-dev/varar/go/core"
	"github.com/varar-dev/varar/go/runner"
)

// BuildRegistry builds the step registry for a run.
type BuildRegistry func() core.Registry

// ContextFactory maps a step file to its fresh initial state.
type ContextFactory func(file string) any

// Case is one enumerated test case: either an example (Run non-nil) or a drift
// finding (DriftMessage non-empty).
type Case struct {
	Name         string
	Source       string
	Rel          string
	run          func() *core.StepFailure
	index        int
	DriftMessage string
}

// Collect enumerates every example (and any drift) matched by varar.config.json
// under root, without touching a *testing.T — the unit-testable core of Run.
// Drift is reconciled here: a clean run rewrites the baseline; when update is
// false each drifted paragraph becomes a failing Case.
func Collect(root string, build BuildRegistry, ctx ContextFactory, update bool) ([]Case, error) {
	cfg, err := config.ReadVarConfig(root)
	if err != nil {
		return nil, err
	}
	var cases []Case
	for _, oathPath := range runner.FindOaths(cfg, root) {
		sourceBytes, _ := os.ReadFile(oathPath)
		source := string(sourceBytes)
		oathFile := filepath.Base(oathPath)
		rel, relErr := filepath.Rel(root, oathPath)
		if relErr != nil {
			rel = oathFile
		}
		rel = filepath.ToSlash(rel)

		plan := runner.PlanOath(oathFile, source, build())
		for i, display := range runner.ExampleNames(plan) {
			index := i
			src := source
			r := rel
			p := plan
			cases = append(cases, Case{
				Name:   r + "::" + display,
				Source: src,
				Rel:    r,
				index:  index,
				run:    func() *core.StepFailure { return runner.RunExample(p, ctx, index) },
			})
		}

		// Drift reconciliation: rewrites the baseline on a clean run; each
		// drifted paragraph becomes a failing case (ADR 0002).
		store := runner.NewFileBaselineStore(root)
		doc := core.Parse(oathFile, source)
		for _, drifted := range core.ReconcileDrift(store, rel, source, doc, plan, update) {
			cases = append(cases, Case{
				Name:         rel + "::var:drift:" + strconv.Itoa(drifted.Line),
				Source:       source,
				Rel:          rel,
				DriftMessage: core.DriftMessage(drifted),
			})
		}
	}
	return cases, nil
}

// Run enumerates the oaths under root and reports one Go subtest per example
// (and per drift finding). VARAR_UPDATE=1/true accepts drift instead of failing.
func Run(t *testing.T, root string, build BuildRegistry, ctx ContextFactory) {
	t.Helper()
	update := isUpdate()
	cases, err := Collect(root, build, ctx, update)
	if err != nil {
		t.Fatalf("var: %v", err)
	}
	for _, c := range cases {
		c := c
		t.Run(c.Name, func(t *testing.T) {
			if c.DriftMessage != "" {
				t.Error(c.DriftMessage)
				return
			}
			if failure := c.run(); failure != nil {
				t.Error(runner.RenderFailure(*failure, c.Source, c.Rel))
			}
		})
	}
}

func isUpdate() bool {
	switch os.Getenv("VARAR_UPDATE") {
	case "1", "true":
		return true
	}
	return false
}
