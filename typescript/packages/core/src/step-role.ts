// The role a step definition plays, mirroring concepts/sensors-and-actuators.md:
//   stimulus — drives the software: arranges the quiescent state AND acts on it
//   sensor   — the read-only assertion (the only role that returns for comparison)
// The concepts arrange/act (given/when) remain useful narration in a document,
// but they share one mechanism: a stimulus evolves state, a sensor observes it.
export type StepKind = 'stimulus' | 'sensor'

// Guess a step's role from its neighbours, using the canonical document order
// stimulus → sensor. Purely structural — never inspects sentence words (no
// Given/When/Then heuristics). The generated snippet always offers the other
// role as a commented alternative, so a wrong guess is cheap to correct.
export function inferStepRole(neighbours: {
  readonly before: ReadonlyArray<StepKind>
  readonly after: ReadonlyArray<StepKind>
}): StepKind {
  // A step with nothing after it is most likely the observation; anything
  // followed by other steps is most likely driving the software.
  return neighbours.after.length === 0 ? 'sensor' : 'stimulus'
}
