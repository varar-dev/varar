package varrunner

import (
	"fmt"

	vc "github.com/varar-dev/varar-go/core"
)

// PlanSpec parses + plans one spec.
func PlanSpec(name, source string, registry vc.Registry) vc.ExecutionPlan {
	return vc.Plan(vc.Parse(name, source), registry)
}

// ExampleNames is the per-example display names: the innermost heading (or the
// body-derived name when there is no heading), de-duplicated with a [n] suffix —
// so header-bound rows share their binding sentence's name.
func ExampleNames(plan vc.ExecutionPlan) []string {
	seen := map[string]int{}
	names := make([]string, len(plan.Examples))
	for i, ex := range plan.Examples {
		base := ex.Name
		if len(ex.ScopeStack) > 0 {
			base = ex.ScopeStack[len(ex.ScopeStack)-1]
		}
		idx := seen[base]
		seen[base] = idx + 1
		if idx == 0 {
			names[i] = base
		} else {
			names[i] = fmt.Sprintf("%s[%d]", base, idx)
		}
	}
	return names
}

// RunExample runs a single example by index. contextFactory maps a step file to
// its fresh initial state. Returns nil on pass, the failure on fail.
func RunExample(plan vc.ExecutionPlan, contextFactory func(file string) vc.Value, index int) *vc.StepFailure {
	ports := vc.ExecutePorts{
		Reporter:      func(vc.Diagnostic) {},
		CreateContext: contextFactory,
	}
	return vc.CollectExamples(plan, ports)[index].Run()
}
