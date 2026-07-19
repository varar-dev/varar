package varcore

// Guess a step's role from its neighbours in document order — port of
// step-role.ts / step_role.rs. Purely structural (no keyword heuristics).

// Neighbours holds the kinds of the steps immediately before and after the step
// being inferred.
type Neighbours struct {
	Before []StepKind
	After  []StepKind
}

// InferStepRole guesses a step's role: nothing after it → most likely the
// observation (sensor); anything followed by other steps → most likely driving
// (stimulus).
func InferStepRole(n Neighbours) StepKind {
	if len(n.After) == 0 {
		return Sensor
	}
	return Stimulus
}
