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
	// The example's identity in the run-result payload (ADR 0014): its name and
	// the 1-based source lines of its steps. Empty for a drift case.
	ExampleName string
	Lines       []int
}

// Collect enumerates every example (and any drift) matched by varar.config.json
// under root, without touching a *testing.T — the unit-testable core of Run.
// Drift is reconciled here: a clean run rewrites the baseline; when update is
// false each drifted paragraph becomes a failing Case.
func Collect(root string, build BuildRegistry, ctx ContextFactory, update bool) ([]Case, error) {
	cfg, err := config.ReadConfig(root)
	if err != nil {
		return nil, err
	}
	var cases []Case
	oaths := runner.FindOaths(cfg, root)

	// Drop baselines for oaths the config no longer discovers. Reconciliation is
	// per-oath and never sees a path that has gone, so the lock would otherwise
	// accumulate dead entries forever (#70). Once per run, keyed off the config
	// globs — which here IS the full set, since Collect always discovers
	// everything (`go test -run` filters the subtests, not the discovery).
	keep := make([]string, 0, len(oaths))
	for _, oathPath := range oaths {
		rel, relErr := filepath.Rel(root, oathPath)
		if relErr != nil {
			rel = filepath.Base(oathPath)
		}
		keep = append(keep, filepath.ToSlash(rel))
	}
	core.PruneBaselines(runner.NewFileBaselineStore(root), keep, update)

	for _, oathPath := range oaths {
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
			example := p.Examples[index]
			var lines []int
			for _, step := range example.Steps {
				if len(lines) == 0 || lines[len(lines)-1] != step.MatchSpan.StartLine {
					lines = append(lines, step.MatchSpan.StartLine)
				}
			}
			cases = append(cases, Case{
				Name:        r + "::" + display,
				Source:      src,
				Rel:         r,
				index:       index,
				run:         func() *core.StepFailure { return runner.RunExample(p, ctx, index) },
				ExampleName: example.Name,
				Lines:       lines,
			})
		}

		// Drift reconciliation: rewrites the baseline on a clean run; each
		// drifted paragraph becomes a failing case (ADR 0002).
		store := runner.NewFileBaselineStore(root)
		doc := core.Parse(oathFile, source)
		for _, drifted := range core.ReconcileDrift(store, rel, source, doc, plan, update) {
			cases = append(cases, Case{
				Name:         rel + "::varar:drift:" + strconv.Itoa(drifted.Line),
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
	// Run results for the language server (ADR 0014). `go test` has no end-of-run
	// hook, so the collector is flushed once every subtest has finished — t.Run
	// with a non-parallel subtest returns only after it completes.
	results := runner.NewResults()
	for _, c := range cases {
		c := c
		t.Run(c.Name, func(t *testing.T) {
			if c.DriftMessage != "" {
				t.Error(c.DriftMessage)
				return
			}
			failure := c.run()
			if failure == nil {
				results.Record(c.Rel, c.Source, core.ExampleResult{
					Name: c.ExampleName, Status: core.StatusPassed, Lines: c.Lines,
				})
				return
			}
			// Recorded from the failure itself: ToFailure reads the anchor the
			// executor attached to it, so an editor underlines the failing step.
			line := 0
			if len(c.Lines) > 0 {
				line = c.Lines[0]
			}
			results.Record(c.Rel, c.Source, core.ExampleResult{
				Name:    c.ExampleName,
				Status:  core.StatusFailed,
				Lines:   c.Lines,
				Failure: ptr(core.ToFailure(*failure, c.Rel, line)),
			})
			t.Error(runner.RenderFailure(*failure, c.Source, c.Rel))
		})
	}
	results.FlushAll(root)
}

func ptr[T any](value T) *T { return &value }

func isUpdate() bool {
	switch os.Getenv("VARAR_UPDATE") {
	case "1", "true":
		return true
	}
	return false
}
