export const VERSION = '0.7.0'

export type {
  Block,
  Blockquote,
  Doc,
  Example,
  Fence,
  Heading,
  ListItem,
  Paragraph,
  Row,
  SegmentOffset,
  Table,
  ThematicBreak,
} from './ast.ts'
export type { CellDiff, RowCheck } from './cell-diff.ts'
export {
  CellMismatchError,
  compareRow,
  compareTable,
  isCellMismatchError,
  ReturnShapeError,
} from './cell-diff.ts'
export type {
  BundleArtifacts,
  DocArtifact,
  FailureArtifact,
  PlanArtifact,
  RegistryArtifact,
  StepTrace,
  TraceArtifact,
} from './conformance.ts'
export {
  canonicalStringify,
  runConformance,
  toDocArtifact,
  toFailureArtifact,
  toPlanArtifact,
  toRegistryArtifact,
} from './conformance.ts'
export { deepEqual } from './deep-equal.ts'
export type {
  AmbiguousInput,
  Candidate,
  Diagnostic,
  DiagnosticCode,
  Severity,
} from './diagnostics.ts'
export { ambiguousMatch, driftDetected } from './diagnostics.ts'
export { compareDocString, DOC_STRING_COLUMN } from './doc-string-diff.ts'
export type { BaselineExample, Drift, LockFile, OathBaseline } from './drift.ts'
export {
  deriveOathBaseline,
  detectDrift,
  driftDiagnostics,
  liveExamples,
  parseLockFile,
  pruneBaselines,
  pruneLockFile,
  reconcileDrift,
  stringifyLockFile,
} from './drift.ts'
export type { ExecutePorts, ExecutionObserver, QueuedExample, StepObservation } from './execute.ts'
export {
  collectExamples,
  executePlan,
  isUnexpectedPassError,
  UnexpectedPassError,
} from './execute.ts'
export type { ExpressionDiff, ExpressionSegment, ParamFate } from './expression-segments.ts'
export { diffExpressions, expressionSegments, renderExpression } from './expression-segments.ts'
export { toFailure } from './failure.ts'
export { hashSource } from './hash.ts'
export type { AmbiguityCollision, Hit, ResolvedSteps } from './matcher.ts'
export { findHits, resolveHits } from './matcher.ts'
export { compareParams } from './param-diff.ts'
export { parse } from './parse.ts'
export type { ExecutionPlan, PlannedExample, PlannedStep } from './plan.ts'
export { plan } from './plan.ts'
export type { BaselineStore, Reporter, TestSink } from './ports.ts'
export type {
  ParameterTypeInput,
  Registry,
  StepHandler,
  StepInput,
  StepRegistration,
} from './registry.ts'
export { addStep, createRegistry, defineParameterType } from './registry.ts'
export type { CellFailure, ExampleResult, OathResults } from './result.ts'
export type { RunDiagnostic } from './run-diagnostics.ts'
export { runResultDiagnostics } from './run-diagnostics.ts'
export { scan } from './scanner.ts'
export type { Sentence } from './sentences.ts'
export { splitSentences } from './sentences.ts'
export type { Span } from './span.ts'
export { spanFromOffsets } from './span.ts'
export type { StepKind } from './step-role.ts'
export { inferStepRole } from './step-role.ts'
export { structure } from './structurer.ts'
