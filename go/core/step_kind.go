package core

// StepKind is a step's role: a stimulus drives the software (arranges + acts); a
// sensor is the read-only assertion (the only role that returns for comparison).
// Port of step-role.ts's StepKind / step_kind.rs.
type StepKind int

const (
	Stimulus StepKind = iota
	Sensor
)
